import * as client from "openid-client";

const providerConfigs = {
    google: {
        issuer: "https://accounts.google.com",
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    },
    microsoft: {
        issuer: "https://login.microsoftonline.com/common/v2.0",
        clientId: process.env.MICROSOFT_CLIENT_ID,
        clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
    },
};

const configCache = new Map();

export async function getConfig(provider) {
    if (configCache.has(provider)) return configCache.get(provider);
    const entry = providerConfigs[provider];
    if (!entry) throw new Error(`Unknown or unconfigured OAuth provider: ${provider}`);
    const config = await client.discovery(new URL(entry.issuer), entry.clientId, entry.clientSecret);
    configCache.set(provider, config);
    return config;
}

export function redirectUrl(provider) {
    return `${process.env.SERVER_ORIGIN}/api/auth/oauth/${provider}/callback`;
}

export function isSupportedProvider(provider) {
    return Object.prototype.hasOwnProperty.call(providerConfigs, provider);
}