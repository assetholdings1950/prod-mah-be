const test = require("node:test");
const assert = require("node:assert/strict");
const agentModel = require("../models/agent.model");
const clientModel = require("../models/client.model");
const { createAgentByAdminQuery } = require("../query/agent.query");

test("admin creation produces an active verified agent with a unique referral code", async (t) => {
    const originalExists = agentModel.exists;
    const originalCreate = agentModel.create;
    const originalClientExists = clientModel.exists;
    let createdPayload;

    t.after(() => {
        agentModel.exists = originalExists;
        agentModel.create = originalCreate;
        clientModel.exists = originalClientExists;
    });

    agentModel.exists = async () => false;
    clientModel.exists = async () => false;
    agentModel.create = async (payload) => {
        createdPayload = payload;
        return {
            _id: "agent-object-id",
            ...payload,
            toObject() {
                return { _id: this._id, ...payload };
            },
        };
    };

    const result = await createAgentByAdminQuery({
        firstName: "  Ada ",
        lastName: " Lovelace  ",
        email: " ADA@EXAMPLE.COM ",
        password: "strong-password",
        createdBy: "admin-object-id",
    });

    assert.equal(result.status, true);
    assert.equal(result.statusCode, 201);
    assert.equal(createdPayload.firstName, "Ada");
    assert.equal(createdPayload.lastName, "Lovelace");
    assert.equal(createdPayload.email, "ada@example.com");
    assert.equal(createdPayload.isVerified, true);
    assert.equal(createdPayload.status, "active");
    assert.match(createdPayload.agentId, /^#\d{5}$/);
    assert.notEqual(createdPayload.passwordHash, "strong-password");
    assert.equal("password" in createdPayload, false);
    assert.match(createdPayload.referralCode, /^MAH[A-Z0-9]{6}$/);
    assert.equal(createdPayload.sponsorAgent, null);
    assert.equal("otpCode" in createdPayload, false);
    assert.equal("otpExpires" in createdPayload, false);
    assert.equal("passwordHash" in result.agent, false);
});

test("admin creation rejects duplicate email addresses", async (t) => {
    const originalExists = agentModel.exists;
    t.after(() => { agentModel.exists = originalExists; });
    agentModel.exists = async () => true;

    const result = await createAgentByAdminQuery({
        firstName: "Ada",
        lastName: "Lovelace",
        email: "ada@example.com",
        password: "strong-password",
    });

    assert.equal(result.status, false);
    assert.equal(result.statusCode, 409);
});

test("admin creation links a valid referring agent without reusing their code", async (t) => {
    const originalExists = agentModel.exists;
    const originalFindOne = agentModel.findOne;
    const originalCreate = agentModel.create;
    const originalClientExists = clientModel.exists;
    let createdPayload;

    t.after(() => {
        agentModel.exists = originalExists;
        agentModel.findOne = originalFindOne;
        agentModel.create = originalCreate;
        clientModel.exists = originalClientExists;
    });

    agentModel.exists = async () => false;
    clientModel.exists = async () => false;
    agentModel.findOne = (filter) => ({
        select: () => ({
            lean: async () => filter.referralCode === "MAHSPONSOR" ? { _id: "sponsor-object-id" } : null,
        }),
    });
    agentModel.create = async (payload) => {
        createdPayload = payload;
        return {
            _id: "agent-object-id",
            ...payload,
            toObject() {
                return { _id: this._id, ...payload };
            },
        };
    };

    const result = await createAgentByAdminQuery({
        firstName: "Grace",
        lastName: "Hopper",
        email: "grace@example.com",
        password: "strong-password",
        referralCode: " mahsponsor ",
    });

    assert.equal(result.status, true);
    assert.equal(createdPayload.sponsorAgent, "sponsor-object-id");
    assert.match(createdPayload.referralCode, /^MAH[A-Z0-9]{6}$/);
    assert.notEqual(createdPayload.referralCode, "MAHSPONSOR");
});

test("admin creation rejects an unknown referring agent code", async (t) => {
    const originalExists = agentModel.exists;
    const originalFindOne = agentModel.findOne;

    t.after(() => {
        agentModel.exists = originalExists;
        agentModel.findOne = originalFindOne;
    });

    agentModel.exists = async () => false;
    agentModel.findOne = () => ({
        select: () => ({ lean: async () => null }),
    });

    const result = await createAgentByAdminQuery({
        firstName: "Grace",
        lastName: "Hopper",
        email: "grace@example.com",
        password: "strong-password",
        referralCode: "unknown",
    });

    assert.equal(result.status, false);
    assert.equal(result.statusCode, 400);
    assert.equal(result.message, "The referring agent's referral code is invalid.");
});
