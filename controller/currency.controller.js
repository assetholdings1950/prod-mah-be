const axios = require("axios").default;
let ratesCache = {
  rates: null,
  lastFetched: 0,
};
const RATES_CACHE_TTL = 5 * 60 * 1000;

let coinsCache = {
  symbolMap: null,
  lastFetched: 0,
};
const COINS_CACHE_TTL = 24 * 60 * 60 * 1000;

const priceCache = {};
const PRICE_CACHE_TTL = 5 * 60 * 1000;

const fetchRates = async () => {
  const now = Date.now();
  if (ratesCache.rates && (now - ratesCache.lastFetched < RATES_CACHE_TTL)) {
    return ratesCache.rates;
  }

  try {
    console.log("[CurrencyController] Fetching fresh exchange rates from CoinGecko...");
    const response = await axios.get("https://api.coingecko.com/api/v3/exchange_rates");
    if (response.data && response.data.rates) {
      ratesCache.rates = response.data.rates;
      ratesCache.lastFetched = now;
      console.log("[CurrencyController] Exchange rates updated successfully.");
      return ratesCache.rates;
    }
    throw new Error("Invalid response structure from CoinGecko.");
  } catch (error) {
    console.error("[CurrencyController] Error fetching rates from CoinGecko:", error.message);
    if (ratesCache.rates) {
      console.warn("[CurrencyController] Using stale cached rates as fallback.");
      return ratesCache.rates;
    }
    throw new Error("Unable to fetch exchange rates and no cached data is available.");
  }
};

const fetchCoinsList = async () => {
  const now = Date.now();
  if (coinsCache.symbolMap && (now - coinsCache.lastFetched < COINS_CACHE_TTL)) {
    return coinsCache.symbolMap;
  }

  try {
    console.log("[CurrencyController] Fetching fresh coins list from CoinGecko...");
    const response = await axios.get("https://api.coingecko.com/api/v3/coins/list");
    if (response.data && Array.isArray(response.data)) {
      const grouped = {};
      for (const coin of response.data) {
        if (!coin.symbol || !coin.id) continue;
        const sym = coin.symbol.toUpperCase();
        if (!grouped[sym]) {
          grouped[sym] = [];
        }
        grouped[sym].push(coin);
      }

      const symbolMap = {};
      for (const sym in grouped) {
        grouped[sym].sort((a, b) => a.id.length - b.id.length);
        symbolMap[sym] = {
          id: grouped[sym][0].id,
          name: grouped[sym][0].name,
          unit: sym,
          type: "crypto"
        };
      }

      coinsCache.symbolMap = symbolMap;
      coinsCache.lastFetched = now;
      console.log(`[CurrencyController] Coins list updated. Total symbols mapped: ${Object.keys(symbolMap).length}`);
      return symbolMap;
    }
    throw new Error("Invalid response structure from CoinGecko /coins/list.");
  } catch (error) {
    console.error("[CurrencyController] Error fetching coins list from CoinGecko:", error.message);
    if (coinsCache.symbolMap) {
      console.warn("[CurrencyController] Using stale cached coins list as fallback.");
      return coinsCache.symbolMap;
    }
    throw new Error("Unable to fetch coins list and no cached data is available.");
  }
};

const fetchPrices = async (coinIds) => {
  const now = Date.now();
  const idsToFetch = [];
  const result = {};

  for (const id of coinIds) {
    const cached = priceCache[id];
    if (cached && (now - cached.lastFetched < PRICE_CACHE_TTL)) {
      result[id] = cached.usd;
    } else {
      idsToFetch.push(id);
    }
  }

  if (idsToFetch.length === 0) {
    return result;
  }

  try {
    console.log(`[CurrencyController] Fetching fresh prices for: ${idsToFetch.join(", ")}`);
    const idsQueryParam = idsToFetch.join(",");
    const response = await axios.get(`https://api.coingecko.com/api/v3/simple/price?ids=${idsQueryParam}&vs_currencies=usd`);

    if (response.data) {
      for (const id of idsToFetch) {
        if (response.data[id] && response.data[id].usd !== undefined) {
          const usdPrice = response.data[id].usd;
          priceCache[id] = {
            usd: usdPrice,
            lastFetched: now
          };
          result[id] = usdPrice;
        } else {
          if (priceCache[id]) {
            console.warn(`[CurrencyController] No price returned for ${id}. Using stale cached price.`);
            result[id] = priceCache[id].usd;
          } else {
            throw new Error(`Price not found for coin ID: ${id}`);
          }
        }
      }
      return result;
    }
    throw new Error("Invalid response structure from CoinGecko /simple/price.");
  } catch (error) {
    console.error("[CurrencyController] Error fetching prices from CoinGecko:", error.message);
    let missingAny = false;
    for (const id of coinIds) {
      if (priceCache[id]) {
        result[id] = priceCache[id].usd;
      } else {
        missingAny = true;
      }
    }
    if (!missingAny) {
      console.warn("[CurrencyController] Using stale cached prices as fallback.");
      return result;
    }
    throw new Error(`Unable to fetch simple prices. Error: ${error.message}`);
  }
};

const convertCurrencyController = async (req, res, next) => {
  try {
    const { amount, from, to } = req.query;

    if (!from || !to) {
      return res.status(400).json({
        status: false,
        message: "Parameters 'from' and 'to' are required."
      });
    }

    const numericAmount = parseFloat(amount || 1);
    if (isNaN(numericAmount)) {
      return res.status(400).json({
        status: false,
        message: "Parameter 'amount' must be a valid number."
      });
    }

    const fromUpper = from.toUpperCase();
    const toUpper = to.toUpperCase();
    const fromLower = from.toLowerCase();
    const toLower = to.toLowerCase();

    const [rates, symbolMap] = await Promise.all([
      fetchRates(),
      fetchCoinsList()
    ]);

    let fromMeta = rates[fromLower] || symbolMap[fromUpper];
    let toMeta = rates[toLower] || symbolMap[toUpper];

    if (!fromMeta) {
      return res.status(400).json({
        status: false,
        message: `Unsupported currency code for 'from': ${from}`
      });
    }

    if (!toMeta) {
      return res.status(400).json({
        status: false,
        message: `Unsupported currency code for 'to': ${to}`
      });
    }

    if (fromUpper === toUpper) {
      return res.json({
        status: true,
        source: "identity",
        amount: numericAmount,
        from: {
          code: fromUpper,
          name: fromMeta.name,
          unit: fromMeta.unit,
          type: fromMeta.type
        },
        to: {
          code: toUpper,
          name: toMeta.name,
          unit: toMeta.unit,
          type: toMeta.type
        },
        rate: 1,
        convertedAmount: numericAmount,
        lastUpdated: new Date().toISOString()
      });
    }

    const isFromFiat = fromMeta.type === "fiat";
    const isToFiat = toMeta.type === "fiat";

    if (isFromFiat && isToFiat) {
      try {
        console.log(`[CurrencyController] Fiat-to-Fiat detected (${fromUpper} -> ${toUpper}). Querying Frankfurter API...`);
        const url = `https://api.frankfurter.app/latest?amount=${numericAmount}&from=${fromUpper}&to=${toUpper}`;
        const response = await axios.get(url);

        if (response.data && response.data.rates && response.data.rates[toUpper] !== undefined) {
          const convertedVal = response.data.rates[toUpper];
          const rateVal = convertedVal / numericAmount;

          return res.json({
            status: true,
            source: "frankfurter",
            amount: numericAmount,
            from: {
              code: fromUpper,
              name: fromMeta.name,
              unit: fromMeta.unit,
              type: "fiat"
            },
            to: {
              code: toUpper,
              name: toMeta.name,
              unit: toMeta.unit,
              type: "fiat"
            },
            rate: Number(rateVal.toFixed(8)),
            convertedAmount: Number(convertedVal.toFixed(8)),
            lastUpdated: new Date().toISOString()
          });
        }
      } catch (error) {
        console.warn(`[CurrencyController] Frankfurter API failed. Falling back to CoinGecko. Error: ${error.message}`);
      }
    }
    const getUsdPrice = async (code, meta) => {
      if (rates[code.toLowerCase()]) {
        const valueInBtc = rates[code.toLowerCase()].value;
        const usdValueInBtc = rates.usd.value;
        return usdValueInBtc / valueInBtc;
      }

      const prices = await fetchPrices([meta.id]);
      return prices[meta.id];
    };

    const fromUsdPrice = await getUsdPrice(fromUpper, fromMeta);
    const toUsdPrice = await getUsdPrice(toUpper, toMeta);

    const rate = fromUsdPrice / toUsdPrice;
    const convertedAmount = numericAmount * rate;

    return res.json({
      status: true,
      source: "coingecko",
      amount: numericAmount,
      from: {
        code: fromUpper,
        name: fromMeta.name,
        unit: fromMeta.unit,
        type: fromMeta.type
      },
      to: {
        code: toUpper,
        name: toMeta.name,
        unit: toMeta.unit,
        type: toMeta.type
      },
      rate: Number(rate.toFixed(8)),
      convertedAmount: Number(convertedAmount.toFixed(8)),
      lastUpdated: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

const convertCurrency = async (from, to, amount = 1) => {
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

  if (isFromFiat && isToFiat) {
    try {
      const url = `https://api.frankfurter.app/latest?amount=${numAmount}&from=${fromUpper}&to=${toUpper}`;
      const response = await axios.get(url);
      if (response.data?.rates?.[toUpper] !== undefined) {
        const convertedVal = response.data.rates[toUpper];
        const rateVal      = convertedVal / numAmount;
        return {
          status: true, source: "frankfurter", amount: numAmount,
          from: { code: fromUpper, name: fromMeta.name, unit: fromMeta.unit, type: "fiat" },
          to:   { code: toUpper,   name: toMeta.name,   unit: toMeta.unit,   type: "fiat" },
          rate: Number(rateVal.toFixed(8)),
          convertedAmount: Number(convertedVal.toFixed(8)),
          lastUpdated: new Date().toISOString(),
        };
      }
    } catch {
      // Fall through to CoinGecko
    }
  }

  const getUsdPrice = async (code, meta) => {
    if (rates[code.toLowerCase()]) {
      return rates.usd.value / rates[code.toLowerCase()].value;
    }
    const prices = await fetchPrices([meta.id]);
    return prices[meta.id];
  };

  const fromUsdPrice = await getUsdPrice(fromUpper, fromMeta);
  const toUsdPrice   = await getUsdPrice(toUpper,   toMeta);

  const rate            = fromUsdPrice / toUsdPrice;
  const convertedAmount = numAmount * rate;

  return {
    status: true, source: "coingecko", amount: numAmount,
    from: { code: fromUpper, name: fromMeta.name, unit: fromMeta.unit, type: fromMeta.type },
    to:   { code: toUpper,   name: toMeta.name,   unit: toMeta.unit,   type: toMeta.type },
    rate: Number(rate.toFixed(8)),
    convertedAmount: Number(convertedAmount.toFixed(8)),
    lastUpdated: new Date().toISOString(),
  };
};

module.exports = {
  convertCurrencyController,
  convertCurrency,
};
