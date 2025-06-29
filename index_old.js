const puppeteer = require('puppeteer');
const express = require('express');

const app = express();
const port = 3000;

app.use(express.json());

async function getAirbnbListingDetails(airbnbUrl) {
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: 'new',
            args: [ '--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security', '--disable-gpu', '--enable-logging', '--disable-dev-shm-usage', '--incognito']
        });
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        await page.setViewport({ width: 1440, height: 900 });

        await page.goto(airbnbUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });

        const itemSelector = 'div[itemprop="itemListElement"]';
        const expectedMinCount = 18; // Número mínimo esperado de anúncios para considerar a página carregada

        try {
            // Espera até que um número mínimo de elementos de listagem seja carregado
            await page.waitForFunction(
                (selector, expectedCount) => {
                    return document.querySelectorAll(selector).length >= expectedCount;
                },
                { timeout: 60000, polling: 'raf' }, // Timeout de 60 segundos, polling via requestAnimationFrame
                itemSelector,
                expectedMinCount
            );
        } catch (waitError) {
            console.warn(`Aviso: Não foi possível encontrar o número mínimo esperado de elementos da lista '${itemSelector}' após 60 segundos. Pode indicar que a página não carregou completamente ou que o seletor está desatualizado. Erro: ${waitError.message}`);
        }

        const listings = await page.evaluate((selector) => {
            const elements = document.querySelectorAll(selector);
            const data = [];
            const roomIdRegex = /\/rooms\/(\d+)\?/;

            // Extract the 'avaliables' field from the h1 span
            let avaliables = null;
            const avaliablesElement = document.querySelector('h1 span:nth-child(2)');
            if (avaliablesElement) {
                const numberMatch = avaliablesElement.textContent.trim().match(/\d+/g);
                avaliables = numberMatch ? parseInt(numberMatch[0], 10) : 1000;
            }

            elements.forEach(el => {
                let name = null;
                let roomId = null;
                let totalReviews = null;
                let score = null;
                let price = null;

                const nameMeta = el.querySelector('meta[itemprop="name"]');
                if (nameMeta) {
                    name = nameMeta.getAttribute('content');
                }

                const urlMeta = el.querySelector('meta[itemprop="url"]');
                if (urlMeta) {
                    const fullUrl = urlMeta.getAttribute('content');
                    const match = fullUrl.match(roomIdRegex);
                    if (match && match[1]) {
                        roomId = match[1];
                    }
                }

                const targetSvg = el.querySelector('svg:has(path[fill-rule="evenodd"])');
                if (targetSvg) {
                    const immediateParentSpan = targetSvg.parentNode;
                    if (immediateParentSpan) {
                        const grandParentSpan = immediateParentSpan.parentNode;
                        if (grandParentSpan) {
                            const ratingSpan = grandParentSpan.querySelector(':scope > span:last-child');
                            if (ratingSpan) {
                                const textContent = ratingSpan.textContent.trim();
                                const match = textContent.match(/(\d+,\d+)\s*\((\d+)\)/);
                                if (match) {
                                    score = parseFloat(match[1].replace(',', '.'));
                                    totalReviews = parseInt(match[2], 10);
                                }
                            }
                        }
                    }
                } else {
                    const scoreSpan = el.querySelector('span[aria-label^="Avaliação média de"]');
                    if (scoreSpan) {
                        const scoreText = scoreSpan.getAttribute('aria-label');
                        const scoreValMatch = scoreText.match(/(\d+(\.\d+)?)/);
                        if (scoreValMatch) {
                            score = parseFloat(scoreValMatch[1]);
                        }
                    }
                    const reviewsTextSpan = el.querySelector('span.r1dxs1cn'); 
                    if (reviewsTextSpan) {
                        const reviewsText = reviewsTextSpan.textContent;
                        const totalReviewsMatch = reviewsText.match(/\((\d+)\)/);
                        if (totalReviewsMatch) {
                            totalReviews = parseInt(totalReviewsMatch[1], 10);
                        }
                    }
                }
                
                let rawPriceText = null;
                const priceElement = el.querySelector('div._tt122r span._tyxjp1'); 
                if (priceElement) {
                    rawPriceText = priceElement.textContent;
                } else {
                    const buttons = el.querySelectorAll('button[type="button"]');
                    buttons.forEach(button => {
                        const priceSpan = Array.from(button.querySelectorAll('span')).find(span => span.textContent.trim().startsWith('R$'));
                        if (priceSpan) {
                            rawPriceText = priceSpan.textContent.trim();
                        }
                    });
                }
                if (rawPriceText) {
                    price = parseFloat(rawPriceText.replace('R$', '').replace(/\./g, '').replace(',', '.'));
                }

                if (name || roomId) {
                    data.push({
                        name,
                        roomId,
                        total_reviews: totalReviews,
                        score,
                        price,
                        avaliables // Added the new 'avaliables' attribute here
                    });
                }
            });
            return data;
        }, itemSelector);

        return listings;
    } catch (error) {
        console.error(`Erro ao obter detalhes da listagem do Airbnb: ${error.message}`);
        return null;
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

async function scrapeAirbnbPage(baseAirbnbUrl, pageNumber) {
    let airbnbUrl = baseAirbnbUrl;

    if (pageNumber > 0) {
        const offset = 18 * pageNumber;
        const cursorObject = {
            section_offset: 0,
            items_offset: offset,
            version: 1
        };
        const cursor = Buffer.from(JSON.stringify(cursorObject)).toString('base64');
        airbnbUrl = `${baseAirbnbUrl}&cursor=${encodeURIComponent(cursor)}`;
    }

    const scrapedData = await getAirbnbListingDetails(airbnbUrl);

    if (!scrapedData || scrapedData.length === 0) {
        return { data: [], requestedPageUrl: airbnbUrl };
    }

    const formattedData = scrapedData.map((item, index) => ({
        room_id: item.roomId,
        title: item.name,
        total_reviews: item.total_reviews,
        score: item.score,
        price: item.price,
        avaliables: item.avaliables, // Ensure 'avaliables' is included in the formatted data
        position: pageNumber * 18 + index + 1
    }));

    return { data: formattedData, requestedPageUrl: airbnbUrl };
}

app.post('/scrape', async (req, res) => {
    try {
        const page = req.body.page || 0;
        const airbnbUrl = req.body.airbnbUrl;

        if (!airbnbUrl) {
            return res.status(400).json({ error: 'A URL do Airbnb é obrigatória no corpo da requisição.' });
        }

        const result = await scrapeAirbnbPage(airbnbUrl, page);
        res.json(result);
    } catch (error) {
        console.error(`Erro na rota /scrape: ${error.message}`);
        res.status(500).json({ error: 'Erro interno do servidor ao processar a requisição.' });
    }
});

app.listen(port, () => {
    console.log(`Servidor rodando em http://localhost:${port}`);
});
