const test = require("node:test");
const assert = require("node:assert/strict");
const agentModel = require("../models/agent.model");
const clientModel = require("../models/client.model");
const { createReferralAgentByAgentQuery } = require("../query/agent.query");

const VALID_REFERRER_ID = "aaaaaaaaaaaaaaaaaaaaaaaa";

test("agent referral forces the sponsor to the calling agent and ignores any referral code in the body", async (t) => {
    const originalFindById = agentModel.findById;
    const originalExists = agentModel.exists;
    const originalFindOne = agentModel.findOne;
    const originalCreate = agentModel.create;
    const originalClientExists = clientModel.exists;
    let createdPayload;

    t.after(() => {
        agentModel.findById = originalFindById;
        agentModel.exists = originalExists;
        agentModel.findOne = originalFindOne;
        agentModel.create = originalCreate;
        clientModel.exists = originalClientExists;
    });

    agentModel.findById = () => ({
        select: () => ({ lean: async () => ({ _id: VALID_REFERRER_ID, status: "active" }) }),
    });
    agentModel.exists = async () => false;
    clientModel.exists = async () => false;
    // If the query ever tried to resolve a body referral code, this would hand
    // back a different sponsor — the assertion below proves it does not.
    agentModel.findOne = () => ({
        select: () => ({ lean: async () => ({ _id: "ffffffffffffffffffffffff" }) }),
    });
    agentModel.create = async (payload) => {
        createdPayload = payload;
        return { _id: "new-agent-id", ...payload, toObject() { return { _id: this._id, ...payload }; } };
    };

    const result = await createReferralAgentByAgentQuery(
        {
            firstName: "Grace",
            lastName: "Hopper",
            email: "grace@example.com",
            password: "strong-password",
            referralCode: "MAHSOMEONEELSE",
        },
        VALID_REFERRER_ID,
    );

    assert.equal(result.status, true);
    assert.equal(result.statusCode, 201);
    assert.equal(String(createdPayload.sponsorAgent), VALID_REFERRER_ID);
    assert.equal(String(createdPayload.createdBy), VALID_REFERRER_ID);
    assert.equal(createdPayload.isVerified, true);
    assert.equal(createdPayload.status, "active");
    assert.match(createdPayload.referralCode, /^MAH[A-Z0-9]{6}$/);
    assert.notEqual(createdPayload.referralCode, "MAHSOMEONEELSE");
});

test("agent referral rejects an inactive referrer", async (t) => {
    const originalFindById = agentModel.findById;
    t.after(() => { agentModel.findById = originalFindById; });

    agentModel.findById = () => ({
        select: () => ({ lean: async () => ({ _id: VALID_REFERRER_ID, status: "suspended" }) }),
    });

    const result = await createReferralAgentByAgentQuery(
        { firstName: "Grace", lastName: "Hopper", email: "grace@example.com", password: "strong-password" },
        VALID_REFERRER_ID,
    );

    assert.equal(result.status, false);
    assert.equal(result.statusCode, 403);
});

test("agent referral rejects a missing/invalid referrer id", async () => {
    const result = await createReferralAgentByAgentQuery(
        { firstName: "Grace", lastName: "Hopper", email: "grace@example.com", password: "strong-password" },
        "not-an-object-id",
    );

    assert.equal(result.status, false);
    assert.equal(result.statusCode, 401);
});

test("agent referral still enforces the shared field validation", async (t) => {
    const originalFindById = agentModel.findById;
    t.after(() => { agentModel.findById = originalFindById; });

    agentModel.findById = () => ({
        select: () => ({ lean: async () => ({ _id: VALID_REFERRER_ID, status: "active" }) }),
    });

    const result = await createReferralAgentByAgentQuery(
        { firstName: "Grace", lastName: "Hopper", email: "grace@example.com", password: "short" },
        VALID_REFERRER_ID,
    );

    assert.equal(result.status, false);
    assert.equal(result.statusCode, 400);
});
