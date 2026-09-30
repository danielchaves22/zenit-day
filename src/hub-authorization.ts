export function allowedHubRedirect(value: string, configuredOrigin: string): string {
  const url = new URL(value);
  const origin = new URL(configuredOrigin);
  if (origin.protocol !== "https:" && !(origin.protocol === "http:" && ["localhost", "127.0.0.1"].includes(origin.hostname)))
    throw new Error("O endereço do Hub precisa usar HTTPS.");
  if (url.origin !== origin.origin || url.pathname !== "/oauth/day/callback" || url.username || url.password || url.hash)
    throw new Error("O destino da autorização não corresponde ao Zenit Hub configurado.");
  return url.toString();
}
