/**
 * Shared currency conversion service.
 * Extracted from currency.controller.js so it can be reused by portfolio service
 * without going through an HTTP layer.
 * Uses same CoinGecko APIs with in-memory TTL caches.
 */

const axios = require("axios").default;

// ── Caches ────────────────────────────────────────────────────────────────────

let ratesCache    = { rates: null, lastFetched: 0 };
let coinsCache    = { symbolMap: null, lastFetched: 0 };
const priceCache  = {};

const RATES_TTL  = 5  * 60 * 1000;   // 5 minutes
const COINS_TTL  = 24 * 60 * 60 * 1000; // 24 hours
const PRICE_TTL  = 5  * 60 * 1000;   // 5 minutes

// ── Internal fetchers ─────────────────────────────────────────────────────────

async function fetchRates() {
    const now = Date.now();
    if (ratesCache.rates && now - ratesCache.lastFetched < RATES_TTL) {
        return ratesCache.rates;
    }
    const res = await axios.get("https://api.coingecko.com/api/v3/exchange_rates");
    if (!res.data?.rates) throw new Error("Invalid exchange rates response from CoinGecko.");
    ratesCache = { rates: res.data.rates, lastFetched: now };
    return ratesCache.rates;
}

async function fetchCoinsList() {
    const now = Date.now();
    if (coinsCache.symbolMap && now - coinsCache.lastFetched < COINS_TTL) {
        return coinsCache.symbolMap;
    }
    const res = await axios.get("https://api.coingecko.com/api/v3/coins/list");
    if (!Array.isArray(res.data)) throw new Error("Invalid coins list from CoinGecko.");

    const grouped = {};
    for (const coin of res.data) {
        if (!coin.symbol || !coin.id) continue;
        const sym = coin.symbol.toUpperCase();
        if (!grouped[sym]) grouped[sym] = [];
        grouped[sym].push(coin);
    }

    const symbolMap = {};
    for (const sym in grouped) {
        grouped[sym].sort((a, b) => a.id.length - b.id.length);
        symbolMap[sym] = { id: grouped[sym][0].id, name: grouped[sym][0].name, unit: sym, type: "crypto" };
    }

    coinsCache = { symbolMap, lastFetched: now };
    return symbolMap;
}

async function fetchPrices(coinIds) {
    const now = Date.now();
    const toFetch = [];
    const result  = {};

    for (const id of coinIds) {
        const cached = priceCache[id];
        if (cached && now - cached.lastFetched < PRICE_TTL) {
            result[id] = cached.usd;
        } else {
            toFetch.push(id);
        }
    }

    if (toFetch.length === 0) return result;

    const res = await axios.get(
        `https://api.coingecko.com/api/v3/simple/price?ids=${toFetch.join(",")}&vs_currencies=usd`
    );

    for (const id of toFetch) {
        const usd = res.data?.[id]?.usd;
        if (usd === undefined) {
            if (priceCache[id]) { result[id] = priceCache[id].usd; continue; }
            throw new Error(`Price not found for coin: ${id}`);
        }
        priceCache[id] = { usd, lastFetched: now };
        result[id] = usd;
    }

    return result;
}

async function getUsdPrice(codeUpper, meta, rates) {
    const rateLower = codeUpper.toLowerCase();
    if (rates[rateLower]) {
        return rates.usd.value / rates[rateLower].value;
    }
    const prices = await fetchPrices([meta.id]);
    return prices[meta.id];
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Converts `amount` units of `from` currency to `to` currency.
 *
 * @param {string} from   - Currency code, e.g. "USD"
 * @param {string} to     - Currency code, e.g. "SOL"
 * @param {number} amount - Amount to convert (default 1)
 * @returns {Promise<{
 *   status: boolean, source: string, amount: number,
 *   from: object, to: object,
 *   rate: number, convertedAmount: number, lastUpdated: string
 * }>}
 */
async function convertCurrency(from, to, amount = 1) {
    const fromUpper = from.toUpperCase();
    const toUpper   = to.toUpperCase();
    const fromLower = from.toLowerCase();
    const toLower   = to.toLowerCase();
    const numAmount = parseFloat(amount) || 1;

    const [rates, symbolMap] = await Promise.all([fetchRates(), fetchCoinsList()]);

    const fromMeta = rates[fromLower] || symbolMap[fromUpper];
    const toMeta   = rates[toLower]   || symbolMap[toUpper];

    if (!fromMeta) throw new Error(`Unsupported currency: ${from}`);
    if (!toMeta)   throw new Error(`Unsupported currency: ${to}`);

    // Identity
    if (fromUpper === toUpper) {
        return {
            status: true, source: "identity", amount: numAmount,
            from: { code: fromUpper, name: fromMeta.name, unit: fromMeta.unit, type: fromMeta.type },
            to:   { code: toUpper,   name: toMeta.name,   unit: toMeta.unit,   type: toMeta.type },
            rate: 1, convertedAmount: numAmount, lastUpdated: new Date().toISOString(),
        };
    }

    const isFromFiat = fromMeta.type === "fiat";
    const isToFiat   = toMeta.type   === "fiat";

    // Fiat-to-Fiat via Frankfurter
    if (isFromFiat && isToFiat) {
        try {
            const res = await axios.get(
                `https://api.frankfurter.app/latest?amount=${numAmount}&from=${fromUpper}&to=${toUpper}`
            );
            if (res.data?.rates?.[toUpper] !== undefined) {
                const convertedVal = res.data.rates[toUpper];
                const rateVal      = convertedVal / numAmount;
                return {
                    status: true, source: "frankfurter", amount: numAmount,
                    from: { code: fromUpper, name: fromMeta.name, unit: fromMeta.unit, type: "fiat" },
                    to:   { code: toUpper,   name: toMeta.name,   unit: toMeta.unit,   type: "fiat" },
                    rate: parseFloat(rateVal.toFixed(8)),
                    convertedAmount: parseFloat(convertedVal.toFixed(8)),
                    lastUpdated: new Date().toISOString(),
                };
            }
        } catch {
            // Fall through to CoinGecko
        }
    }

    // Crypto or mixed via CoinGecko
    const fromUsdPrice = await getUsdPrice(fromUpper, fromMeta, rates);
    const toUsdPrice   = await getUsdPrice(toUpper,   toMeta,   rates);

    const rate            = fromUsdPrice / toUsdPrice;
    const convertedAmount = numAmount * rate;

    return {
        status: true, source: "coingecko", amount: numAmount,
        from: { code: fromUpper, name: fromMeta.name, unit: fromMeta.unit, type: fromMeta.type },
        to:   { code: toUpper,   name: toMeta.name,   unit: toMeta.unit,   type: toMeta.type },
        rate: parseFloat(rate.toFixed(8)),
        convertedAmount: parseFloat(convertedAmount.toFixed(8)),
        lastUpdated: new Date().toISOString(),
    };
}

module.exports = { convertCurrency };
