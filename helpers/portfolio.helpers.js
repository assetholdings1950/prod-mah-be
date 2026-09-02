const mongoose = require("mongoose");

// ── Portfolio ID ──────────────────────────────────────────────────────────────

/**
 * Generates a unique portfolio identifier.
 * Format: MAH-PF-YYYYMMDD-XXXX   e.g. MAH-PF-20260626-8F4K
 */
function generatePortfolioId() {
    const date = new Date();
    const yyyy = date.getFullYear();
    const mm   = String(date.getMonth() + 1).padStart(2, "0");
    const dd   = String(date.getDate()).padStart(2, "0");
    const rand = Math.random().toString(36).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4).padEnd(4, "0");
    return `MAH-PF-${yyyy}${mm}${dd}-${rand}`;
}

// ── Investment mode ───────────────────────────────────────────────────────────

/**
 * Maps plan category to investment mode.
 * monthly → sip
 * lumpsum / crypto → lumpsum
 */
function getInvestmentModeByPlanCategory(category) {
    return category === "monthly" ? "sip" : "lumpsum";
}

// ── Amount validation ─────────────────────────────────────────────────────────

/**
 * Validates amountUsd against plan constraints.
 * Returns null if valid, or an error message string.
 */
function validatePlanAmount(plan, amountUsd) {
    if (!amountUsd || isNaN(amountUsd) || amountUsd <= 0) {
        return "Investment amount must be a positive number.";
    }

    // Crypto plans have no min/max restrictions
    if (plan.category === "crypto") return null;

    if (plan.minAmount != null && amountUsd < plan.minAmount) {
        return `Minimum investment amount for this plan is $${plan.minAmount}.`;
    }

    if (plan.maxAmount != null && amountUsd > plan.maxAmount) {
        return `Maximum investment amount for this plan is $${plan.maxAmount}.`;
    }

    return null;
}

/**
 * Validates durationMonths against plan constraints.
 * Returns null if valid, or an error message string.
 */
function validateDuration(plan, durationMonths) {
    if (!durationMonths || !Number.isInteger(durationMonths) || durationMonths < 1) {
        return "Duration must be a positive integer (months).";
    }

    const min = plan.durationMinMonths;
    const max = plan.durationMaxMonths;

    if (min != null && durationMonths < min) {
        return `Minimum duration for this plan is ${min} months.`;
    }

    if (max != null && durationMonths > max) {
        return `Maximum duration for this plan is ${max} months.`;
    }

    return null;
}

// ── Date calculations ─────────────────────────────────────────────────────────

/**
 * Calculates key investment dates.
 * @param {Date} startedAt   - Investment start date (usually now)
 * @param {number} durationMonths
 * @param {number|null} lockInMonths - If null, uses durationMonths
 * @returns {{ maturityDate: Date, lockInEndDate: Date }}
 */
function calculateDates(startedAt, durationMonths, lockInMonths = null) {
    const maturityDate  = addMonths(new Date(startedAt), durationMonths);
    const lockInEndDate = addMonths(new Date(startedAt), lockInMonths ?? durationMonths);
    return { maturityDate, lockInEndDate };
}

/**
 * Returns a new Date with the given number of months added.
 */
function addMonths(date, months) {
    const d = new Date(date);
    d.setMonth(d.getMonth() + months);
    return d;
}

// ── Return calculations ───────────────────────────────────────────────────────

/**
 * Calculates expected returns for a single lot / one-time investment.
 *
 * @param {number} amountUsd
 * @param {number} annualRoi   - Annual ROI percentage (e.g. 12 for 12%)
 * @param {string} payoutType  - "monthly" | "quarterly" | "maturity"
 * @param {number} durationMonths
 * @returns {{ monthlyInterestUsd, expectedProfitUsd, expectedMaturityValueUsd }}
 */
function calculateInvestmentReturns(amountUsd, annualRoi, payoutType, durationMonths) {
    const monthlyRate = annualRoi / 100 / 12;

    let monthlyInterestUsd;
    let expectedProfitUsd;

    if (payoutType === "monthly" || payoutType === "quarterly") {
        // Interest calculated on principal per month
        monthlyInterestUsd = amountUsd * monthlyRate;
        expectedProfitUsd  = monthlyInterestUsd * durationMonths;
    } else {
        // Maturity payout — compound-style annual calculation
        monthlyInterestUsd = amountUsd * monthlyRate;
        expectedProfitUsd  = amountUsd * (annualRoi / 100) * (durationMonths / 12);
    }

    const expectedMaturityValueUsd = amountUsd + expectedProfitUsd;

    return {
        monthlyInterestUsd:      parseFloat(monthlyInterestUsd.toFixed(8)),
        expectedProfitUsd:       parseFloat(expectedProfitUsd.toFixed(8)),
        expectedMaturityValueUsd:parseFloat(expectedMaturityValueUsd.toFixed(8)),
    };
}

/**
 * Builds a portfolio summary object from its lots array.
 */
function buildPortfolioSummary(lots) {
    let totalInvestedUsd         = 0;
    let totalExpectedProfitUsd   = 0;
    let expectedMaturityValueUsd = 0;
    let activeLots  = 0;
    let maturedLots = 0;

    for (const lot of lots) {
        totalInvestedUsd         += lot.amountUsd           ?? 0;
        totalExpectedProfitUsd   += lot.expectedProfitUsd   ?? 0;
        expectedMaturityValueUsd += lot.expectedMaturityValueUsd ?? 0;
        if (lot.status === "active")  activeLots++;
        if (lot.status === "matured") maturedLots++;
    }

    return {
        totalInvestedUsd:        parseFloat(totalInvestedUsd.toFixed(8)),
        totalExpectedProfitUsd:  parseFloat(totalExpectedProfitUsd.toFixed(8)),
        totalPaidProfitUsd:      0,
        currentValueUsd:         parseFloat(totalInvestedUsd.toFixed(8)),
        expectedMaturityValueUsd:parseFloat(expectedMaturityValueUsd.toFixed(8)),
        totalLots:  lots.length,
        activeLots,
        maturedLots,
    };
}

/**
 * Calculates remaining lot duration in months (from investedAt to maturityDate).
 * Used to correctly calculate returns for SIP lots added mid-way.
 */
function monthsBetween(from, to) {
    const f  = new Date(from);
    const t  = new Date(to);
    const yr = t.getFullYear() - f.getFullYear();
    const mo = t.getMonth()    - f.getMonth();
    return Math.max(1, yr * 12 + mo);
}

module.exports = {
    generatePortfolioId,
    getInvestmentModeByPlanCategory,
    validatePlanAmount,
    validateDuration,
    calculateDates,
    addMonths,
    calculateInvestmentReturns,
    buildPortfolioSummary,
    monthsBetween,
};
