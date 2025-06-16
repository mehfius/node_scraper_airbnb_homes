# Airbnb Scraper API

## Descrição
Esta API realiza web scraping de anúncios do Airbnb utilizando Puppeteer. Ela extrai informações como nome do anúncio, ID do quarto, número de avaliações, pontuação e preço.

## Funcionalidades Principais
- **Extração de Dados**: Captura informações detalhadas de anúncios do Airbnb.
- **Paginação Dinâmica**: Suporte para múltiplas páginas utilizando o cursor do Airbnb.
- **API REST**: Endpoint `/scrape` para iniciar a raspagem e retornar os dados em JSON.

## Como Funciona
1. O cliente faz uma requisição POST para o endpoint `/scrape` com os parâmetros:
   - `airbnbUrl`: URL base do Airbnb.
   - `page`: Número da página a ser raspada (opcional, padrão é 0).
2. A API ajusta a URL para incluir o cursor de paginação, se necessário.
3. Puppeteer é usado para navegar na página e capturar os dados.
4. Os dados são processados e retornados em formato JSON.
