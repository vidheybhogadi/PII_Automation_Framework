/** Builds a concrete path from a `{name}` template, URL-encoding path parameters. */
export function buildPath(template: string, params: Record<string, string> = {}): string {
  return template.replace(/\{(\w+)\}/g, (_match, name: string) => {
    const value = params[name];
    if (value === undefined) {
      throw new Error(`Missing path parameter "${name}" for endpoint template ${template}`);
    }
    return encodeURIComponent(value);
  });
}
