const crypto = require("crypto");
const fs = require("fs/promises");
const mongoose = require("mongoose");
const cheerio = require("cheerio");
const { Resend } = require("resend");
const AdminEmailThread = require("../models/adminEmailThread.model");
const AdminEmailMessage = require("../models/adminEmailMessage.model");

const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const MAX_RECIPIENTS = 50;
const ALLOWED_ATTACHMENT_TYPES = new Set([
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/csv",
    "text/plain",
    "image/gif",
    "image/jpeg",
    "image/png",
    "image/webp",
]);

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PREFIX_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/;

const getResend = () => {
    if (!process.env.RESEND_API_KEY) throw new Error("RESEND_API_KEY is not configured");
    return new Resend(process.env.RESEND_API_KEY);
};

const getSendingDomain = () =>
    String(process.env.EMAIL_SENDING_DOMAIN || "send.merlionassetholdings.com")
        .trim()
        .toLowerCase();

const getReceivingDomain = () =>
    String(process.env.EMAIL_RECEIVING_DOMAIN || "").trim().toLowerCase();

const getDefaultPrefix = () =>
    String(process.env.EMAIL_DEFAULT_FROM_PREFIX || "onboarding").trim().toLowerCase();

const escapeHtml = (value) =>
    String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

const stripHtml = (value) =>
    String(value || "")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/\s+/g, " ")
        .trim();

// Tags an admin may use when composing a rich-text message. Anything else is unwrapped.
const RICH_TEXT_TAGS = new Set([
    "p", "br", "b", "strong", "i", "em", "u", "s", "strike", "del",
    "h1", "h2", "h3", "h4", "ul", "ol", "li", "blockquote", "a", "span", "div", "font",
]);

const SAFE_LINK_PATTERN = /^(?:https?:|mailto:)/i;
const MAX_HTML_BODY = 250000;

// CSS declarations kept from inline style attributes (colour / alignment the editor emits).
const SAFE_STYLE_PROPERTIES = new Set([
    "color", "background-color", "text-align", "font-weight", "font-style",
    "text-decoration", "font-size", "line-height",
]);
const DANGEROUS_STYLE_VALUE = /(?:url\s*\(|expression\s*\(|javascript\s*:|@import|behavior\s*:|-moz-binding)/i;
const SAFE_COLOR_VALUE = /^(#[0-9a-f]{3,8}|rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)|rgba\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*(?:0|1|0?\.\d+)\s*\)|[a-z]+)$/i;

const filterInlineStyle = (raw) =>
    String(raw || "")
        .split(";")
        .map((declaration) => declaration.trim())
        .filter(Boolean)
        .map((declaration) => {
            const separator = declaration.indexOf(":");
            if (separator === -1) return null;
            const property = declaration.slice(0, separator).trim().toLowerCase();
            const value = declaration.slice(separator + 1).trim();
            if (!SAFE_STYLE_PROPERTIES.has(property) || !value || DANGEROUS_STYLE_VALUE.test(value)) return null;
            return `${property}: ${value}`;
        })
        .filter(Boolean)
        .join("; ");

// Server-side allowlist sanitiser for the compose/reply editor HTML. The frontend
// sanitises too, but this is the trust boundary that decides what gets stored and sent.
const sanitizeRichTextHtml = (value) => {
    const input = String(value || "").trim();
    if (!input) return "";

    const $ = cheerio.load(input.slice(0, MAX_HTML_BODY), { decodeEntities: false }, false);

    $("script, style, iframe, object, embed, link, meta, title, head").remove();

    $("*").each((_, node) => {
        const tag = node.tagName ? node.tagName.toLowerCase() : "";
        const $node = $(node);

        if (!RICH_TEXT_TAGS.has(tag)) {
            $node.replaceWith($node.contents());
            return;
        }

        const attribs = { ...node.attribs };
        for (const name of Object.keys(attribs)) {
            const lower = name.toLowerCase();
            if (tag === "a" && lower === "href") continue;
            if (lower === "style") {
                const safe = filterInlineStyle(attribs[name]);
                if (safe) $node.attr("style", safe);
                else $node.removeAttr(name);
                continue;
            }
            if (tag === "font" && lower === "color" && SAFE_COLOR_VALUE.test(String(attribs[name]).trim())) {
                continue;
            }
            $node.removeAttr(name);
        }

        if (tag === "a") {
            const href = String($node.attr("href") || "").trim();
            if (!SAFE_LINK_PATTERN.test(href)) {
                $node.replaceWith($node.contents());
                return;
            }
            $node.attr("href", href);
            $node.attr("target", "_blank");
            $node.attr("rel", "noopener noreferrer nofollow");
        }
    });

    const html = $.root().html() || "";
    return html.replace(/(?:\s|&nbsp;|<br\s*\/?>|<p>\s*<\/p>|<div>\s*<\/div>)+$/gi, "").trim();
};

const htmlHasText = (value) => stripHtml(value).replace(/​/g, "").length > 0;

const extractLatestReply = (value) => {
    const lines = String(value || "").replace(/\r\n/g, "\n").split("\n");
    const quoteStart = lines.findIndex((line) => {
        const trimmed = line.trim();
        return (
            /^>/.test(trimmed) ||
            /^-{2,}\s*original message\s*-{2,}$/i.test(trimmed) ||
            /^on .+ wrote:\s*$/i.test(trimmed) ||
            /^_{5,}$/.test(trimmed)
        );
    });
    const latest = quoteStart >= 0 ? lines.slice(0, quoteStart) : lines;
    const automaticSignature = /^(sent with\s+(?:\[[^\]]+\]\([^)]*\)|\S+)(?:\s+secure email\.?)?|sent from my\s+(?:iphone|ipad|android)|get outlook for\s+(?:ios|android))$/i;

    while (latest.length && !latest[latest.length - 1].trim()) latest.pop();
    while (latest.length && automaticSignature.test(latest[latest.length - 1].trim())) {
        latest.pop();
        while (latest.length && !latest[latest.length - 1].trim()) latest.pop();
    }
    return latest.join("\n").trim() || String(value || "").trim();
};

const extractMailbox = (value) => {
    const normalized = String(value || "").trim().toLowerCase();
    const angleAddress = normalized.match(/<([^<>]+)>/);
    return (angleAddress?.[1] || normalized).trim();
};

const normalizeEmailList = (value) => {
    if (!value) return [];
    let values = value;
    if (typeof value === "string") {
        const trimmed = value.trim();
        if (!trimmed) return [];
        if (trimmed.startsWith("[")) {
            try {
                values = JSON.parse(trimmed);
            } catch {
                values = trimmed.split(/[,;\n]/);
            }
        } else {
            values = trimmed.split(/[,;\n]/);
        }
    }
    const emails = (Array.isArray(values) ? values : [values])
        .map(extractMailbox)
        .filter(Boolean);
    return [...new Set(emails)];
};

const validatePayload = (raw = {}) => {
    const to = normalizeEmailList(raw.to);
    const cc = normalizeEmailList(raw.cc);
    const bcc = normalizeEmailList(raw.bcc);
    const allRecipients = [...to, ...cc, ...bcc];
    if (!to.length) throw new Error("At least one recipient is required");
    if (allRecipients.length > MAX_RECIPIENTS) {
        throw new Error(`A message can include at most ${MAX_RECIPIENTS} recipients`);
    }
    const invalidRecipient = allRecipients.find((email) => !EMAIL_PATTERN.test(email));
    if (invalidRecipient) throw new Error(`Invalid email address: ${invalidRecipient}`);

    const fromPrefix = String(raw.fromPrefix || getDefaultPrefix()).trim().toLowerCase();
    if (!PREFIX_PATTERN.test(fromPrefix)) {
        throw new Error("Sender prefix can contain letters, numbers, dots, underscores, and hyphens only");
    }
    const fromName = String(raw.fromName || "Merlion Asset Holdings")
        .replace(/[\r\n<>]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 80);
    const subject = String(raw.subject || "").replace(/[\r\n]/g, " ").trim().slice(0, 200);
    const bodyHtml = sanitizeRichTextHtml(raw.bodyHtml);
    let body = String(raw.body || "").trim().slice(0, 100000);
    if (!body && bodyHtml) body = stripHtml(bodyHtml).slice(0, 100000);
    if (!subject) throw new Error("Subject is required");
    if (!body && !htmlHasText(bodyHtml)) throw new Error("Message body is required");
    if (!body) body = stripHtml(bodyHtml).slice(0, 100000);

    return {
        to,
        cc,
        bcc,
        fromPrefix,
        fromName: fromName || "Merlion Asset Holdings",
        fromAddress: `${fromPrefix}@${getSendingDomain()}`,
        subject,
        body,
        bodyHtml,
    };
};

const filesFromRequest = (files) => {
    if (!files?.attachments) return [];
    return Array.isArray(files.attachments) ? files.attachments : [files.attachments];
};

const prepareAttachments = async (files) => {
    const input = filesFromRequest(files);
    const totalSize = input.reduce((sum, file) => sum + Number(file.size || 0), 0);
    if (totalSize > MAX_ATTACHMENT_BYTES) {
        throw new Error("Attachments must be 20 MB or less in total");
    }
    for (const file of input) {
        if (!ALLOWED_ATTACHMENT_TYPES.has(String(file.mimetype || "").toLowerCase())) {
            throw new Error(`Unsupported attachment type: ${file.name || "unknown file"}`);
        }
    }

    return Promise.all(
        input.map(async (file) => {
            const filename = String(file.name || "attachment")
                .replace(/[\r\n\\/]/g, "_")
                .slice(0, 180);
            const content = file.tempFilePath
                ? await fs.readFile(file.tempFilePath)
                : file.data;
            return {
                resend: {
                    filename,
                    content,
                    contentType: file.mimetype || "application/octet-stream",
                },
                stored: {
                    filename,
                    contentType: file.mimetype || "application/octet-stream",
                    size: Number(file.size || content.length || 0),
                    disposition: "attachment",
                },
            };
        }),
    );
};

const cleanupRequestFiles = async (files) => {
    await Promise.all(
        filesFromRequest(files)
            .map((file) => file.tempFilePath)
            .filter(Boolean)
            .map((path) => fs.unlink(path).catch(() => undefined)),
    );
};

// Inline styles applied to editor tags so formatting survives in email clients that ignore <style> blocks.
const EMAIL_BLOCK_STYLES = {
    p: "margin:0 0 16px;line-height:1.7;",
    h1: "margin:24px 0 12px;font-size:22px;line-height:1.3;font-weight:800;color:#0b1b3a;",
    h2: "margin:22px 0 10px;font-size:18px;line-height:1.35;font-weight:700;color:#0b1b3a;",
    h3: "margin:18px 0 8px;font-size:15px;line-height:1.4;font-weight:700;color:#0b1b3a;",
    ul: "margin:0 0 16px;padding-left:22px;",
    ol: "margin:0 0 16px;padding-left:22px;",
    li: "margin:0 0 6px;line-height:1.7;",
    blockquote: "margin:0 0 16px;padding:8px 16px;border-left:3px solid #c7d0e0;color:#5b6577;",
    a: "color:#1d4ed8;text-decoration:underline;",
};

const inlineEmailStyles = (html) => {
    if (!html) return "";
    const $ = cheerio.load(html, { decodeEntities: false }, false);
    for (const [tag, style] of Object.entries(EMAIL_BLOCK_STYLES)) {
        $(tag).each((_, node) => {
            const existing = $(node).attr("style");
            $(node).attr("style", existing ? `${existing};${style}` : style);
        });
    }
    return $.root().html() || "";
};

const renderEmailHtml = ({ body, bodyHtml, senderName }) => {
    const content = bodyHtml && htmlHasText(bodyHtml)
        ? `<div style="line-height:1.7;">${inlineEmailStyles(bodyHtml)}</div>`
        : escapeHtml(body)
            .split(/\n{2,}/)
            .map((paragraph) => `<p style="margin:0 0 16px;line-height:1.7;">${paragraph.replace(/\n/g, "<br>")}</p>`)
            .join("");
    return `<!doctype html><html><body style="margin:0;background:#f4f6f9;font-family:Arial,sans-serif;color:#13223f;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:32px 16px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:660px;background:#fff;border:1px solid #e4e9f1;border-radius:16px;overflow:hidden;"><tr><td style="height:5px;background:#081b3a"></td></tr><tr><td align="center" style="padding:28px 28px 22px;border-bottom:1px solid #edf1f6;"><img src="https://res.cloudinary.com/dctnrrrav/image/upload/f_auto,q_auto/MAH_main-logo_mjesun" width="150" alt="Merlion Asset Holdings" style="display:block;max-width:150px;height:auto;"></td></tr><tr><td style="padding:30px 34px 24px;font-size:15px;">${content}</td></tr><tr><td style="padding:18px 34px 28px;border-top:1px solid #edf1f6;color:#6b778c;font-size:12px;line-height:1.6;">Sent by ${escapeHtml(senderName)} through the Merlion Asset Holdings administration system.</td></tr></table></td></tr></table></body></html>`;
};

const actorSnapshot = (user = {}) => ({
    id: mongoose.isValidObjectId(user.sub) ? user.sub : null,
    email: String(user.email || "").toLowerCase(),
});

const makeReplyAddress = (thread) => {
    const domain = getReceivingDomain();
    return domain ? `thread+${thread.replyToken}@${domain}` : (process.env.EMAIL_REPLY_TO || undefined);
};

const syncProviderAttachments = async (resend, message) => {
    if (!message.attachments.length || !message.providerEmailId) return;
    try {
        const response = await resend.emails.attachments.list({ emailId: message.providerEmailId });
        const providerAttachments = response.data?.data || [];
        message.attachments.forEach((attachment, index) => {
            const match = providerAttachments.find(
                (item) => item.filename === attachment.filename && !message.attachments.some((saved, savedIndex) => savedIndex < index && saved.providerAttachmentId === item.id),
            );
            if (match) attachment.providerAttachmentId = match.id;
        });
        await message.save();
    } catch {
        // Attachment IDs are an optional convenience. They can be resolved later.
    }
};

const dispatchOutbound = async ({ thread, rawPayload, requestFiles, user, isReply = false }) => {
    const payload = validatePayload(rawPayload);
    let prepared = [];
    let message;
    try {
        prepared = await prepareAttachments(requestFiles);
        const lastInbound = isReply
            ? await AdminEmailMessage.findOne({ thread: thread._id, direction: "inbound", internetMessageId: { $ne: "" } }).sort({ createdAt: -1 }).lean()
            : null;
        const headers = lastInbound?.internetMessageId
            ? { "In-Reply-To": lastInbound.internetMessageId, References: lastInbound.internetMessageId }
            : undefined;

        message = await AdminEmailMessage.create({
            thread: thread._id,
            direction: "outbound",
            from: `${payload.fromName} <${payload.fromAddress}>`,
            to: payload.to,
            cc: payload.cc,
            bcc: payload.bcc,
            subject: payload.subject,
            bodyText: payload.body,
            bodyHtml: renderEmailHtml({ body: payload.body, bodyHtml: payload.bodyHtml, senderName: payload.fromName }),
            attachments: prepared.map((item) => item.stored),
            status: "pending",
            createdBy: actorSnapshot(user),
        });

        const resend = getResend();
        const response = await resend.emails.send(
            {
                from: `${payload.fromName} <${payload.fromAddress}>`,
                replyTo: makeReplyAddress(thread),
                to: payload.to,
                cc: payload.cc.length ? payload.cc : undefined,
                bcc: payload.bcc.length ? payload.bcc : undefined,
                subject: payload.subject,
                text: payload.body,
                html: message.bodyHtml,
                attachments: prepared.map((item) => item.resend),
                headers,
                tags: [
                    { name: "source", value: "admin_email" },
                    { name: "thread_id", value: String(thread._id) },
                ],
            },
            { idempotencyKey: `admin-email-${message._id}` },
        );
        if (response.error) throw new Error(response.error.message || "Resend rejected the email");

        message.providerEmailId = response.data?.id || "";
        message.status = "sent";
        message.sentAt = new Date();
        message.deliveryEvents.push({ type: "email.sent", at: new Date() });
        await message.save();
        await syncProviderAttachments(resend, message);

        thread.participants = [...new Set([...thread.participants, ...payload.to, ...payload.cc, ...payload.bcc])];
        thread.subject = isReply ? thread.subject : payload.subject;
        thread.lastDirection = "outbound";
        thread.lastSnippet = payload.body.slice(0, 240);
        thread.lastMessageAt = message.sentAt;
        thread.messageCount += 1;
        thread.lastSenderPrefix = payload.fromPrefix;
        await thread.save();
        return { thread, message };
    } catch (error) {
        if (message) {
            message.status = "failed";
            message.lastError = String(error.message || error).slice(0, 2000);
            message.deliveryEvents.push({ type: "email.failed", at: new Date(), detail: { reason: message.lastError } });
            await message.save().catch(() => undefined);
            thread.lastDirection = "outbound";
            thread.lastSnippet = `Failed: ${message.lastError}`.slice(0, 240);
            thread.lastMessageAt = new Date();
            thread.messageCount += 1;
            await thread.save().catch(() => undefined);
        }
        throw error;
    } finally {
        await cleanupRequestFiles(requestFiles);
    }
};

const createThreadAndSend = async ({ rawPayload, requestFiles, user }) => {
    const payload = validatePayload(rawPayload);
    const thread = await AdminEmailThread.create({
        subject: payload.subject,
        participants: [...new Set([...payload.to, ...payload.cc, ...payload.bcc])],
        replyToken: crypto.randomBytes(16).toString("hex"),
        lastSenderPrefix: payload.fromPrefix,
        createdBy: actorSnapshot(user),
    });
    try {
        return await dispatchOutbound({ thread, rawPayload, requestFiles, user });
    } catch (error) {
        if (!thread.messageCount) await AdminEmailThread.deleteOne({ _id: thread._id }).catch(() => undefined);
        throw error;
    }
};

const replyToThread = async ({ threadId, rawPayload, requestFiles, user }) => {
    if (!mongoose.isValidObjectId(threadId)) throw new Error("Invalid conversation ID");
    const thread = await AdminEmailThread.findById(threadId);
    if (!thread) {
        const error = new Error("Conversation not found");
        error.statusCode = 404;
        throw error;
    }
    return dispatchOutbound({ thread, rawPayload, requestFiles, user, isReply: true });
};

const listThreads = async ({ page = 1, limit = 20, search = "", status = "" } = {}) => {
    const normalizedPage = Math.max(Number(page) || 1, 1);
    const normalizedLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const filter = {};
    if (["open", "closed"].includes(status)) filter.status = status;
    if (String(search).trim()) {
        const safe = String(search).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        filter.$or = [{ subject: new RegExp(safe, "i") }, { participants: new RegExp(safe, "i") }];
    }
    const [threads, total, sent, delivered, failed, received] = await Promise.all([
        AdminEmailThread.find(filter)
            .sort({ lastMessageAt: -1 })
            .skip((normalizedPage - 1) * normalizedLimit)
            .limit(normalizedLimit)
            .lean(),
        AdminEmailThread.countDocuments(filter),
        AdminEmailMessage.countDocuments({
            direction: "outbound",
            status: { $in: ["sent", "delivered", "delivery_delayed", "opened", "clicked"] },
        }),
        AdminEmailMessage.countDocuments({ direction: "outbound", status: "delivered" }),
        AdminEmailMessage.countDocuments({ direction: "outbound", status: { $in: ["failed", "bounced", "complained", "suppressed"] } }),
        AdminEmailMessage.countDocuments({ direction: "inbound" }),
    ]);
    return {
        threads,
        pagination: {
            page: normalizedPage,
            limit: normalizedLimit,
            total,
            totalPages: Math.max(Math.ceil(total / normalizedLimit), 1),
        },
        summary: { conversations: total, sent, delivered, failed, received },
        config: {
            sendingDomain: getSendingDomain(),
            defaultPrefix: getDefaultPrefix(),
            receivingEnabled: Boolean(getReceivingDomain()),
        },
    };
};

const getThread = async (threadId) => {
    if (!mongoose.isValidObjectId(threadId)) return null;
    const [thread, messages] = await Promise.all([
        AdminEmailThread.findById(threadId).lean(),
        AdminEmailMessage.find({ thread: threadId }).sort({ createdAt: 1 }).lean(),
    ]);
    return thread ? { thread, messages } : null;
};

const setThreadStatus = async (threadId, status) => {
    if (!mongoose.isValidObjectId(threadId)) return null;
    if (!["open", "closed"].includes(status)) throw new Error("Conversation status must be open or closed");
    return AdminEmailThread.findByIdAndUpdate(threadId, { status }, { new: true }).lean();
};

const resolveAttachment = async ({ messageId, attachmentId }) => {
    if (!mongoose.isValidObjectId(messageId)) return null;
    const message = await AdminEmailMessage.findById(messageId).lean();
    if (!message?.providerEmailId) return null;
    const attachment = message.attachments.find((item) => item.providerAttachmentId === attachmentId);
    if (!attachment) return null;
    const resend = getResend();
    const response = message.direction === "inbound"
        ? await resend.emails.receiving.attachments.get({ emailId: message.providerEmailId, id: attachmentId })
        : await resend.emails.attachments.get({ emailId: message.providerEmailId, id: attachmentId });
    if (response.error) throw new Error(response.error.message || "Could not retrieve attachment");
    return response.data;
};

const extractReplyToken = (addresses = []) => {
    const receivingDomain = getReceivingDomain();
    if (!receivingDomain) return "";
    for (const address of normalizeEmailList(addresses)) {
        const match = address.match(new RegExp(`^thread\\+([a-f0-9]{32})@${receivingDomain.replace(/\./g, "\\.")}$`));
        if (match) return match[1];
    }
    return "";
};

const eventDetail = (data = {}) => ({
    ...(data.failed ? { failed: data.failed } : {}),
    ...(data.bounce ? { bounce: data.bounce } : {}),
    ...(data.suppressed ? { suppressed: data.suppressed } : {}),
    ...(data.click ? { click: data.click } : {}),
});

const handleInbound = async (event) => {
    const providerEmailId = event.data.email_id;
    if (await AdminEmailMessage.exists({ providerEmailId })) return;
    const resend = getResend();
    const response = await resend.emails.receiving.get(providerEmailId);
    if (response.error) throw new Error(response.error.message || "Could not retrieve received email");
    const email = response.data;
    const inboundRecipients = [
        ...normalizeEmailList(email.to || []),
        ...normalizeEmailList(event.data.to || []),
        ...normalizeEmailList(event.data.received_for || []),
    ];
    const replyToken = extractReplyToken(inboundRecipients);
    if (!replyToken) return;
    const inboundFrom = normalizeEmailList(email.from || event.data.from)[0] || String(email.from || event.data.from).toLowerCase();
    const thread = await AdminEmailThread.findOne({ replyToken });
    if (!thread) return;
    const fullBodyText = String(email.text || stripHtml(email.html) || "(No message body)");
    const bodyText = extractLatestReply(fullBodyText).slice(0, 100000);
    try {
        await AdminEmailMessage.create({
            thread: thread._id,
            direction: "inbound",
            from: email.headers?.from || email.from,
            to: [...new Set(inboundRecipients)],
            cc: normalizeEmailList(email.cc || []),
            bcc: normalizeEmailList(email.bcc || []),
            subject: String(email.subject || thread.subject).slice(0, 200),
            bodyText,
            bodyHtml: String(email.html || "").slice(0, 250000),
            attachments: (email.attachments || []).map((attachment) => ({
                providerAttachmentId: attachment.id,
                filename: attachment.filename || "attachment",
                contentType: attachment.content_type,
                size: attachment.size || 0,
                disposition: attachment.content_disposition === "inline" ? "inline" : "attachment",
            })),
            providerEmailId,
            internetMessageId: email.message_id || event.data.message_id || "",
            inReplyTo: email.headers?.["in-reply-to"] || "",
            status: "received",
            receivedAt: new Date(email.created_at || event.created_at || Date.now()),
            deliveryEvents: [{ type: "email.received", at: new Date(event.created_at || Date.now()) }],
        });
    } catch (error) {
        if (error?.code === 11000) return;
        throw error;
    }
    thread.participants = [...new Set([...thread.participants, inboundFrom])];
    thread.lastDirection = "inbound";
    thread.lastSnippet = bodyText.slice(0, 240);
    thread.lastMessageAt = new Date(email.created_at || Date.now());
    thread.messageCount += 1;
    await thread.save();
};

const handleResendWebhook = async ({ rawBody, headers }) => {
    if (!process.env.RESEND_WEBHOOK_SECRET) throw new Error("RESEND_WEBHOOK_SECRET is not configured");
    const resend = getResend();
    const event = resend.webhooks.verify({
        payload: rawBody,
        headers: {
            id: headers["svix-id"],
            timestamp: headers["svix-timestamp"],
            signature: headers["svix-signature"],
        },
        webhookSecret: process.env.RESEND_WEBHOOK_SECRET,
    });
    if (event.type === "email.received") {
        await handleInbound(event);
        return event.type;
    }
    if (event.type.startsWith("email.")) {
        const status = event.type.slice("email.".length);
        const allowedStatuses = new Set(["sent", "delivered", "delivery_delayed", "opened", "clicked", "bounced", "complained", "suppressed", "failed"]);
        if (allowedStatuses.has(status)) {
            await AdminEmailMessage.updateOne(
                { providerEmailId: event.data.email_id },
                {
                    $set: { status, ...(status === "failed" ? { lastError: event.data.failed?.reason || "Delivery failed" } : {}) },
                    $push: { deliveryEvents: { type: event.type, at: new Date(event.created_at || Date.now()), detail: eventDetail(event.data) } },
                },
            );
        }
    }
    return event.type;
};

module.exports = {
    createThreadAndSend,
    replyToThread,
    listThreads,
    getThread,
    setThreadStatus,
    resolveAttachment,
    handleResendWebhook,
    validatePayload,
    normalizeEmailList,
    extractLatestReply,
    getSendingDomain,
    sanitizeRichTextHtml,
    renderEmailHtml,
};
