const puppeteer = require('puppeteer');

/**
 * Valida se a data de check-in na URL é igual ou posterior a amanhã.
 * @param {string} airbnbUrl - A URL do Airbnb a ser validada.
 * @returns {boolean} - Retorna true se a data for válida, senão false.
 */
function validateCheckinDate(airbnbUrl) {
    try {
        const url = new URL(airbnbUrl);
        const checkinDateStr = url.searchParams.get('checkin');

        if (!checkinDateStr) {
            console.error('Erro: O parâmetro "checkin" não foi encontrado na URL.');
            return false;
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1);

        const checkinDate = new Date(`${checkinDateStr}T00:00:00`);

        if (isNaN(checkinDate.getTime())) {
            console.error(`Erro: Formato de data de check-in inválido: "${checkinDateStr}". Use o formato AAAA-MM-DD.`);
            return false;
        }

        if (checkinDate < tomorrow) {
            const formatDate = (date) => date.toISOString().split('T')[0];
            console.error(`Erro: A data de check-in (${formatDate(checkinDate)}) deve ser igual ou posterior a amanhã (${formatDate(tomorrow)}).`);
            return false;
        }

        console.log(`Data de check-in (${checkinDate.toISOString().split('T')[0]}) é válida.`);
        return true;
    } catch (error) {
        console.error('Erro ao processar a URL. Verifique se ela está no formato correto.', error);
        return false;
    }
}


async function getAirbnbListingDetails(airbnbUrl) {
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: "new",
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security', '--disable-gpu', '--disable-dev-shm-usage']
        });
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        await page.setViewport({ width: 1440, height: 900 });

        await page.goto(airbnbUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
        console.log('Página carregada (domcontentloaded).');

        const accommodationListingSelector = 'div[itemprop="itemListElement"]';
        const noResultsSelector = 'main div div div div div div div div div div section h1';
        
        console.log('Aguardando pela resposta inicial da página (lista ou "nenhum resultado")...');

        await page.waitForFunction(
            (listSelector, noResultsSel) => {
                return document.querySelector(listSelector) || document.querySelector(noResultsSel);
            },
            { timeout: 30000 },
            accommodationListingSelector,
            noResultsSelector
        );

        const noResultsElement = await page.$(noResultsSelector);
        if (noResultsElement) {
            const noResultsText = await page.evaluate(el => el.textContent.trim(), noResultsElement);
            console.log(`Nenhuma acomodação encontrada. Mensagem: "${noResultsText}". Encerrando a raspagem.`);
            return {
                availableAccommodationsCount: 0,
                elementText: noResultsText,
                loadedListingsCount: 0,
                accommodations: []
            };
        }
        
        console.log('Resposta inicial recebida. Verificando o total de acomodações...');

        const availableCountSelector = 'h1 span:nth-child(2)';
        let result = {
            availableAccommodationsCount: null,
            elementText: 'Erro: Seletor de contagem de disponíveis não encontrado.',
            loadedListingsCount: 0,
            accommodations: []
        };
        
        try {
            await page.waitForSelector(availableCountSelector, { timeout: 15000 });
            console.log(`Seletor de contagem de disponíveis "${availableCountSelector}" encontrado.`);

            const headerData = await page.evaluate((sel) => {
                let availableAccommodationsCount = null;
                let elementText = null;
                const availableElement = document.querySelector(sel);
                if (availableElement) {
                    elementText = availableElement.textContent.trim();
                    if (elementText.toLowerCase().includes('over 1,000') || elementText.toLowerCase().includes('mais de 1.000') || elementText.toLowerCase().includes('mil')) {
                        availableAccommodationsCount = 1000;
                    } else {
                        const numberMatch = elementText.match(/\d[\d,.]*/);
                        if (numberMatch) {
                            availableAccommodationsCount = parseInt(numberMatch[0].replace(/[^0-9]/g, ''), 10);
                        } else {
                            availableAccommodationsCount = null;
                        }
                    }
                }
                return { availableAccommodationsCount, elementText };
            }, availableCountSelector);

            result.availableAccommodationsCount = headerData.availableAccommodationsCount;
            result.elementText = headerData.elementText;
            console.log(`Texto encontrado para contagem de disponíveis: "${result.elementText}"`);

        } catch (selectorError) {
            console.error(`Erro: Seletor de contagem de disponíveis "${availableCountSelector}" não encontrado. Detalhes: ${selectorError.message}`);
            return result;
        }

        // --- INÍCIO DA MODIFICAÇÃO: Aguardar o carregamento completo da página ---
        if (result.availableAccommodationsCount > 0) {
            const expectedCountOnPage = Math.min(result.availableAccommodationsCount, 18);
            console.log(`Total de ${result.availableAccommodationsCount} acomodações. Aguardando carregar ${expectedCountOnPage} na página...`);
            await page.waitForFunction(
                (selector, count) => document.querySelectorAll(selector).length >= count,
                { timeout: 20000 }, // Timeout para os itens carregarem
                accommodationListingSelector,
                expectedCountOnPage
            );
            console.log(`${expectedCountOnPage} acomodações carregadas.`);
        }
        // --- FIM DA MODIFICAÇÃO ---

        const listingDetails = await page.evaluate((selector) => {
            const listings = document.querySelectorAll(selector);
            const accommodations = [];
            listings.forEach(listing => {
                const titleMeta = listing.querySelector('meta[itemprop="name"]');
                const title = titleMeta?.getAttribute('content') ?? 'Título não encontrado';

                let price = 'Preço não encontrado';
                const priceButtons = listing.querySelectorAll('button[type="button"]');
                if (priceButtons && priceButtons.length > 3) {
                    const priceElement = priceButtons[3];
                    if (priceElement) {
                       price = priceElement.querySelectorAll('span')[0].textContent.trim();
                    }
                }

                accommodations.push({ title, price });
            });
            return {
                count: listings.length,
                accommodations: accommodations
            };
        }, accommodationListingSelector);

        console.log(`Número de acomodações listadas encontradas na tela: ${listingDetails.count}`);
        result.loadedListingsCount = listingDetails.count;
        result.accommodations = listingDetails.accommodations;

        return result;
    } catch (error) {
        console.error(`Erro inesperado ao obter os detalhes de acomodações disponíveis: ${error.message}`);
        return {
            availableAccommodationsCount: 0,
            elementText: `Erro geral: ${error.message}`,
            loadedListingsCount: 0,
            accommodations: []
        };
    } finally {
        if (browser) await browser.close();
    }
}

async function scrapeAirbnbPage(airbnbUrl) {
    const result = await getAirbnbListingDetails(airbnbUrl);
    return result;
}

(async () => {
    const airbnbUrl = process.env.AIRBNB_TEST_URL_2;

    if (!airbnbUrl) {
        console.error('Erro: A variável de ambiente AIRBNB_URL não está definida.');
        process.exit(1);
    }

    if (!validateCheckinDate(airbnbUrl)) {
        process.exit(1);
    }

    console.log(`Iniciando a raspagem...`);
    try {
        const result = await scrapeAirbnbPage(airbnbUrl);

        console.log('\n--- Resultado Final ---');
        console.log('Texto do elemento principal:', result.elementText);

        if (result.loadedListingsCount > 0) {
            console.log('Número total de acomodações disponíveis (do cabeçalho):', result.availableAccommodationsCount);
            console.log('Número exato de acomodações carregadas na página:', result.loadedListingsCount);
            console.log('Acomodações encontradas (título e preço):');
            console.log(result.accommodations);
        } else {
            console.log('Nenhuma acomodação foi carregada ou encontrada para a busca realizada.');
        }
        console.log('---------------------\n');

    } catch (error) {
        console.error(`Erro durante a execução principal: ${error.message}`);
    }
})();
