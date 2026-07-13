import * as client from "openid-client";
import { randomUUID } from "node:crypto";
import * as oauthService from "../services/oauth.service.js";
import * as authService from "../services/auth.service.js";
import { pool } from "../config/db.js";

const COOKIE_OPTS = {
    httpOnly: true,
    signed: true,
    maxAge: 10 * 60 * 1000,
    sameSite: "lax"
};

export async function start (req, res) {
    const { provider } = req.params;
    if (!oauthService.isSupportedProvider(provider)) {
        return res.status(404).json({ success: false, error: { message: "Unknown provider"} });
    }

    const config = await oauthService.getConfig(provider);
    const codeVerifier = client.randomPKCECodeVerifier();
    const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
    const state = client.randomState();

    res.cookie("oauth_pkce", codeVerifier, COOKIE_OPTS);
    res.cookie("oauth_state", state, COOKIE_OPTS);

    const url = client.buildAuthorizationUrl (config, {
        redirect_uri: oauthService.redirectUri(provider),
        scope: "openid email profile",
        code_challenge: codeChallenge,
        code_challenge_method: "S256",
        state,
    });
    res.redirect(url.href);
}

export async function callback(req, res) {
    const { provider } = req.params;
    const failUrl = `${process.env.SERVER_ORIGIN}/login?oauthError=1`;

    try {
        const config = await oauthService.getConfig(provider);
        const tokens = await client.authorizationCodeGrant(
            config,
            new URL(req.originalUrl, process.env.SERVER_ORIGIN),
            {
                pkceCodeVerifier: req.signedCookies.oauth_pkce,
                expectedState: req.signedCookies.oauth_pkce,
            }
        );
        res.clearCookie("oauth_pkce");
        res.clearCookie("oauth_state");

        const claims = tokens.claims();
        if (!claims?.email) throw new Error("Provider did not return an email claim.");

        const [existingIdentity] = await pool.query(
            `SELECT user_id FROM oauth_identity WHERE provider = ? AND provider_user_id = ?`,
            [provider, claims.sub]
        );

        let userId = existingIdentity[0]?.user_id;
        if (!userId) {
            // If no identity row yet, link to an existing account with this email, or create a brand new (password-less) user.
            const existingUser = await authService.findUserByEmail(claims.email);
            userId = existingUser ? existingUser.id : randomUUID();
            if (!existingUser) {
                await pool.query(`INSERT INTO users (id, email, name) VALUES (?, ?, ?)`, [
                    userId,
                    claims.email,
                    claims.name ?? claims.email,
                ]);
            }
            await pool.query(
                `INSERT INTO oauth_identity (id, user_id, provider, provider_user_id, email) VALUES (?, ?, ?, ?, ?)`,
                [randomUUID(), userId, provider, claims.sub, claims.email]
            );
        }

        const user = await authService.findUserById(userId);
        const token = authService.issueToken(user);
        res.redirect(`${process.env.CLIENT_ORIGIN}/oauth-callback?token=${token}`);
    } catch (err) {
        console.error(`[oauth: ${provider}] callback failed:`, err.message);
        res.redirect(failUrl);
    }
}