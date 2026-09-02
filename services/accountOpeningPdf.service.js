const PDFDocument = require("pdfkit");
const axios = require("axios");

const COLORS = {
    navy: "#082548", blue: "#174F9A", paleBlue: "#EAF1F8", gold: "#C79A37",
    green: "#18723A", paleGreen: "#EFF8F1", text: "#102844", muted: "#53677F",
    line: "#D4DEE9", white: "#FFFFFF",
};

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 42;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

const clean = (value, fallback = "-") => {
    const text = String(value ?? "").trim();
    return (text || fallback)
        .replace(/[\u2010-\u2015]/g, "-")
        .replace(/\u00A0/g, " ")
        .replace(/[^\x20-\x7E]/g, "");
};

const formatDate = (value) => {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return clean(value);
    return date.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric", timeZone: "UTC" });
};

const cloudinaryPng = (url) => {
    if (!url || !url.includes("res.cloudinary.com") || !url.includes("/upload/")) return url;
    return url.replace("/upload/", "/upload/f_png,q_auto/");
};

async function fetchImage(source) {
    if (!source) return null;
    try {
        if (source.startsWith("data:image/")) {
            const encoded = source.split(",")[1];
            return encoded ? Buffer.from(encoded, "base64") : null;
        }
        const response = await axios.get(cloudinaryPng(source), { responseType: "arraybuffer", timeout: 12000 });
        return Buffer.from(response.data);
    } catch (error) {
        console.error("PDF image download failed:", error.message);
        return null;
    }
}

function brandMark(doc, x, y, dark = false) {
    doc.save().lineWidth(1.2).strokeColor(COLORS.gold).circle(x + 14, y + 14, 13).stroke();
    doc.fillColor(dark ? COLORS.navy : COLORS.white).font("Helvetica-Bold").fontSize(12).text("M", x + 8.5, y + 7.5, { width: 11, align: "center" }).restore();
}

function pageHeader(doc, compact = false) {
    const height = compact ? 58 : 84;
    doc.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT).fill(COLORS.white);
    doc.rect(0, 0, PAGE_WIDTH, height).fill(COLORS.navy);
    brandMark(doc, MARGIN, compact ? 15 : 27);
    doc.fillColor(COLORS.white).font("Helvetica-Bold").fontSize(compact ? 15 : 19)
        .text("MERLION ASSET HOLDINGS", MARGIN + 40, compact ? 21 : 35, { characterSpacing: 1.2 });
    doc.rect(0, height - 2, PAGE_WIDTH, 2).fill(COLORS.gold);
}

function footer(doc, pageNumber) {
    const y = PAGE_HEIGHT - 39;
    doc.moveTo(MARGIN, y - 8).lineTo(PAGE_WIDTH - MARGIN, y - 8).lineWidth(0.6).strokeColor(COLORS.gold).stroke();
    doc.fillColor(COLORS.muted).font("Helvetica").fontSize(7.5)
        .text("This document is confidential and intended solely for the use of Merlion Asset Holdings.", MARGIN, y, { width: CONTENT_WIDTH - 70 });
    doc.text(`Page ${pageNumber} of 2`, PAGE_WIDTH - MARGIN - 70, y, { width: 70, align: "right" });
}

function sectionTitle(doc, number, title, y) {
    doc.roundedRect(MARGIN, y, CONTENT_WIDTH, 27, 2).fill(COLORS.paleBlue);
    doc.rect(MARGIN, y, 38, 27).fill(COLORS.blue);
    doc.fillColor(COLORS.white).font("Helvetica-Bold").fontSize(10).text(number, MARGIN, y + 8, { width: 38, align: "center" });
    doc.fillColor(COLORS.navy).font("Helvetica-Bold").fontSize(11).text(clean(title), MARGIN + 50, y + 7.5);
    return y + 33;
}

function fieldRows(doc, rows, y, options = {}) {
    const x = options.x ?? MARGIN;
    const width = options.width ?? CONTENT_WIDTH;
    const labelWidth = options.labelWidth ?? 190;
    const rowHeight = options.rowHeight ?? 22;
    rows.forEach(([label, value]) => {
        doc.moveTo(x, y + rowHeight - 3).lineTo(x + width, y + rowHeight - 3).lineWidth(0.45).strokeColor(COLORS.line).stroke();
        doc.fillColor(COLORS.text).font("Helvetica-Bold").fontSize(8.2).text(clean(label), x + 5, y + 5, { width: labelWidth - 10 });
        doc.fillColor(COLORS.text).font("Helvetica").fontSize(8.4).text(clean(value), x + labelWidth, y + 5, { width: width - labelWidth - 5, ellipsis: true });
        y += rowHeight;
    });
    return y;
}

function drawProfile(doc, image, initials) {
    const x = 458;
    const y = 112;
    const w = 95;
    const h = 104;
    doc.roundedRect(x, y, w, h, 3).fillAndStroke("#F1F4F7", COLORS.line);
    if (image) {
        try { doc.image(image, x + 3, y + 3, { fit: [w - 6, h - 6], align: "center", valign: "center" }); return; }
        catch (error) { console.error("PDF profile image render failed:", error.message); }
    }
    doc.fillColor(COLORS.blue).font("Helvetica-Bold").fontSize(24).text(initials || "MAH", x, y + 39, { width: w, align: "center" });
}

function approvedSeal(doc, x, y) {
    doc.save().lineWidth(2).strokeColor(COLORS.green).circle(x, y, 43).stroke();
    doc.lineWidth(0.8).circle(x, y, 36).stroke();
    doc.fillColor(COLORS.green).font("Helvetica-Bold").fontSize(8).text("MERLION ASSET", x - 31, y - 25, { width: 62, align: "center", characterSpacing: 0.5 });
    doc.fontSize(13).text("APPROVED", x - 37, y - 6, { width: 74, align: "center" });
    doc.fontSize(7).text("CLIENT ONBOARDING", x - 34, y + 17, { width: 68, align: "center", characterSpacing: 0.3 });
    doc.restore();
}

async function buildAccountOpeningPdf({ form, client }) {
    const [profileImage, signatureImage] = await Promise.all([
        fetchImage(client.profileImage),
        fetchImage(form.signatureUrl || form.signatureDataUrl),
    ]);

    const reviewer = form.reviewedBy && typeof form.reviewedBy === "object"
        ? [form.reviewedBy.firstName, form.reviewedBy.lastName].filter(Boolean).join(" ") || form.reviewedBy.email
        : "Merlion Asset Holdings Administration";
    const snapshot = form.clientSnapshot || {};
    const declaration = form.declaration || {};
    const legalName = clean(form.legalName || [client.firstName, client.lastName].filter(Boolean).join(" "));
    const initials = legalName.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
    const applicationId = `AOF-${String(form._id).slice(-8).toUpperCase()}`;

    const doc = new PDFDocument({ size: "A4", margin: 0, bufferPages: true, info: { Title: `Account Opening Application - ${legalName}`, Author: "Merlion Asset Holdings", Subject: applicationId } });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    const completed = new Promise((resolve, reject) => { doc.on("end", () => resolve(Buffer.concat(chunks))); doc.on("error", reject); });

    // Page 1
    pageHeader(doc);
    doc.fillColor(COLORS.navy).font("Helvetica-Bold").fontSize(18).text("ACCOUNT OPENING APPLICATION", MARGIN, 108);
    const metaY = 155;
    [["Application ID", applicationId], ["Status", "APPROVED"], ["Approved", formatDate(form.reviewedAt)]].forEach(([label, value], index) => {
        const x = MARGIN + index * 118;
        doc.fillColor(COLORS.muted).font("Helvetica").fontSize(7.5).text(label, x, metaY);
        doc.fillColor(index === 1 ? COLORS.green : COLORS.blue).font("Helvetica-Bold").fontSize(10.5).text(value, x, metaY + 15, { width: 108 });
        if (index < 2) doc.moveTo(x + 108, metaY).lineTo(x + 108, metaY + 40).strokeColor(COLORS.gold).lineWidth(0.5).stroke();
    });
    drawProfile(doc, profileImage, initials);

    let y = sectionTitle(doc, "01", "CLIENT IDENTITY", 238);
    y = fieldRows(doc, [
        ["Full legal name", legalName], ["Client ID", snapshot.clientId || client.clientId],
        ["Email address", snapshot.email || client.email], ["Phone number", `${snapshot.countryCode || client.countryCode || ""} ${snapshot.phoneNumber || client.phoneNumber || ""}`],
        ["Date of birth", snapshot.dateOfBirth || client.dateOfBirth], ["Nationality", snapshot.nationality || client.nationality],
    ], y, { rowHeight: 21 });
    y = sectionTitle(doc, "02", "RESIDENTIAL ADDRESS", y + 7);
    y = fieldRows(doc, [
        ["Country", snapshot.country || client.country], ["City", snapshot.city || client.city],
        ["Country code", snapshot.countryCode || client.countryCode], ["Postal code", snapshot.postalCode || client.postalCode],
        ["Street address", snapshot.address || client.address],
    ], y, { rowHeight: 21 });
    y = sectionTitle(doc, "03", "EMPLOYMENT & FINANCIAL PROFILE", y + 7);
    fieldRows(doc, [
        ["Employment status", declaration.employmentStatus], ["Occupation", declaration.occupation],
        ["Employer / business name", declaration.employerName || "Not applicable"], ["Annual income", declaration.annualIncome],
        ["Primary source of funds", declaration.sourceOfFunds], ["Estimated net worth", declaration.estimatedNetWorth],
    ], y, { rowHeight: 20 });
    footer(doc, 1);

    // Page 2
    doc.addPage({ size: "A4", margin: 0 });
    pageHeader(doc, true);
    y = sectionTitle(doc, "04", "INVESTMENT & REGULATORY DECLARATION", 78);
    y = fieldRows(doc, [
        ["Primary investment objective", declaration.investmentObjective], ["Investment experience", declaration.investmentExperience],
        ["Country of tax residence", declaration.taxResidency], ["Tax identification number", declaration.taxIdentificationNumber],
        ["Politically exposed person", declaration.politicallyExposed === "yes" ? "Yes" : "No"],
        ["US citizen or tax resident", declaration.usPerson === "yes" ? "Yes" : "No"],
        ["Acting as beneficial owner", declaration.beneficialOwner === "yes" ? "Yes, investing for own account" : "No, acting for another beneficial owner"],
    ], y, { rowHeight: 21 });

    y = sectionTitle(doc, "05", "CLIENT DECLARATION", y + 9);
    const declarations = [
        "I confirm that all information provided in this application and my client profile is true, complete, and accurate.",
        "I confirm that the funds used for investment originate from legitimate sources and are not connected to unlawful activity.",
        "I understand that investments involve risk, returns are not guaranteed, and Merlion Asset Holdings may rely on this declaration.",
        "I agree to notify Merlion Asset Holdings promptly if any information in this declaration changes.",
    ];
    declarations.forEach((text, index) => {
        doc.fillColor(COLORS.navy).font("Helvetica-Bold").fontSize(8).text(`${index + 1}.`, MARGIN + 8, y + 2, { width: 14 });
        doc.fillColor(COLORS.text).font("Helvetica").fontSize(8.2).text(text, MARGIN + 27, y + 2, { width: CONTENT_WIDTH - 35, lineGap: 1 });
        y += 29;
    });

    y = sectionTitle(doc, "06", "ELECTRONIC SIGNATURE", y + 5);
    const signatureTop = y + 2;
    doc.fillColor(COLORS.text).font("Helvetica-Bold").fontSize(8).text("Signature", MARGIN + 5, signatureTop + 13);
    doc.moveTo(MARGIN + 110, signatureTop + 42).lineTo(MARGIN + 330, signatureTop + 42).strokeColor(COLORS.line).lineWidth(0.6).stroke();
    if (signatureImage) {
        try { doc.image(signatureImage, MARGIN + 120, signatureTop - 3, { fit: [190, 43], align: "left", valign: "center" }); }
        catch (error) { console.error("PDF signature render failed:", error.message); }
    }
    fieldRows(doc, [["Full legal name", legalName], ["Signed date", formatDate(form.submittedAt)], ["Document version", form.version]], signatureTop + 50, { x: MARGIN, width: CONTENT_WIDTH - 110, labelWidth: 150, rowHeight: 19 });
    y = signatureTop + 114;

    doc.roundedRect(MARGIN, y, CONTENT_WIDTH, 137, 3).fillAndStroke(COLORS.paleGreen, "#BBD9C4");
    doc.fillColor(COLORS.navy).font("Helvetica-Bold").fontSize(11).text("ADMINISTRATIVE APPROVAL", MARGIN + 10, y + 10);
    fieldRows(doc, [["Approved by", reviewer], ["Review date", formatDate(form.reviewedAt)], ["Remarks", form.adminRemarks || "Application reviewed and approved."]], y + 35, { x: MARGIN + 8, width: CONTENT_WIDTH - 128, labelWidth: 108, rowHeight: 24 });
    approvedSeal(doc, PAGE_WIDTH - MARGIN - 57, y + 75);
    // Paint the remaining print area explicitly for consistent rendering in PDF viewers.
    doc.rect(0, y + 137, PAGE_WIDTH, PAGE_HEIGHT - y - 137).fill(COLORS.white);
    footer(doc, 2);

    doc.end();
    return completed;
}

module.exports = { buildAccountOpeningPdf };
