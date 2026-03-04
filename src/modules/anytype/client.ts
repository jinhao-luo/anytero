/**
 * @file client.ts
 *
 * Typed HTTP client for the Anytype local REST API
 * (`http://127.0.0.1:<port>/v1`). All communication with Anytype goes through
 * this module. The Anytype desktop application must be running for any calls
 * to succeed.
 *
 * API version pinned to `2025-11-08`. Authentication uses a Bearer token
 * obtained from Anytype Settings → API Keys.
 */

const ANYTYPE_API_VERSION = "2025-11-08";

/** Minimal representation of an Anytype space returned by `GET /spaces`. */
export interface AnytypeSpace {
  id: string;
  name: string;
}

/** Minimal representation of an Anytype object or type (shared shape). */
export interface AnytypeObject {
  id: string;
  name: string;
}

/** A property value as returned by the Anytype API when fetching an object. */
export interface ObjectPropertyValue {
  /** The format of the property. */
  format:
    | "text"
    | "number"
    | "select"
    | "multi_select"
    | "date"
    | "files"
    | "checkbox"
    | "url"
    | "email"
    | "phone"
    | "objects";
  /** The key of the property. */
  // TODO: consider cases when multiple properties call "Zotero Link" exist
  key: string;
  /** The name of the property. */
  name: string;
  /** The URL value of the property. Present when format is `url`. */
  url?: string;
}

/** A property (relation) defined in an Anytype space. */
export interface AnytypeProperty {
  /** Internal stable key used when attaching a value to an object. */
  key: string;
  name: string;
  /** Anytype format string, e.g. `"url"`, `"text"`, `"number"`. */
  format: string;
}

/**
 * A property key paired with its value, as expected by the Anytype API when
 * creating or updating objects. The discriminant is the value field name.
 */
export type PropertyWithValue =
  | { key: string; url: string }
  | { key: string; text: string }
  | { key: string; number: number }
  | { key: string; checkbox: boolean };

/** Request body for `POST /spaces/:id/objects`. */
export interface CreateObjectPayload {
  name: string;
  icon?: string;
  /** Markdown body text. */
  body?: string;
  /** Key of the Anytype object type to assign. */
  type_key: string;
  properties?: PropertyWithValue[];
}

/** Request body for `PATCH /spaces/:id/objects/:objectId`. All fields optional. */
export interface UpdateObjectPayload {
  name?: string;
  /** Replaces the object's body with this markdown string. */
  markdown?: string;
  properties?: PropertyWithValue[];
}

/**
 * Normalises horizontal-rule separators in a markdown string.
 *
 * The Anytype API has a bug where it round-trips `---` separators with extra
 * surrounding whitespace, producing patterns like `" \n ---\n  "` instead of
 * the canonical `"\n\n---\n"`. Left uncorrected these accumulate on every sync
 * and cause rendering artefacts.
 *
 * This is a temporary workaround — remove once the upstream bug is fixed.
 *
 * @param markdown - Raw markdown string, possibly containing padded `---` lines.
 * @returns The same string with every `---` separator normalised to `\n\n---\n`.
 */
export function patchMarkdown(markdown: string): string {
  return markdown.replace(/( *\n *)+---( *\n *)+/g, "\n\n---\n");
}

/**
 * HTTP client for the Anytype local REST API.
 *
 * Wraps `fetch` with:
 * - Base URL construction (`http://127.0.0.1:<port>/v1`)
 * - Required auth and versioning headers
 * - Error handling (throws on non-2xx responses with the response body)
 */
export class AnytypeClient {
  private _baseUrl: string;
  private _apiKey: string;

  constructor(port: number, apiKey: string) {
    // TODO: allow hostname to be configurable (currently hardcoded to 127.0.0.1)
    this._baseUrl = `http://127.0.0.1:${port}/v1`;
    this._apiKey = apiKey;
  }

  private _headers(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this._apiKey}`,
      "Anytype-Version": ANYTYPE_API_VERSION,
    };
  }

  private async _fetch(
    path: string,
    options: RequestInit = {},
  ): Promise<unknown> {
    const url = `${this._baseUrl}${path}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        ...this._headers(),
        ...((options.headers as Record<string, string>) ?? {}),
      },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Anytype API error ${response.status}: ${body}`);
    }

    return response.json();
  }

  /** Returns all spaces accessible with the configured API key. */
  async listSpaces(): Promise<AnytypeSpace[]> {
    const data = (await this._fetch("/spaces")) as { data: AnytypeSpace[] };
    return data.data ?? [];
  }

  /**
   * Creates a new object in the given space.
   * @returns The ID of the newly created object.
   */
  async createObject(
    spaceId: string,
    payload: CreateObjectPayload,
  ): Promise<string> {
    const data = (await this._fetch(`/spaces/${spaceId}/objects`, {
      method: "POST",
      body: JSON.stringify(payload),
    })) as { object: { id: string } };
    return data.object.id;
  }

  /** Partially updates an existing object (PATCH semantics — only supplied fields change). */
  async updateObject(
    spaceId: string,
    objectId: string,
    payload: UpdateObjectPayload,
  ): Promise<void> {
    // Temporary workaround for an Anytype API bug — see `patchMarkdown`.
    if (payload.markdown !== undefined) {
      payload = { ...payload, markdown: patchMarkdown(payload.markdown) };
    }
    ztoolkit.log("UpdateObject: payload", payload);
    await this._fetch(`/spaces/${spaceId}/objects/${objectId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  }

  /**
   * Fetches a single object. Returns the body, archived flag, and properties
   * so the caller can validate that the object is still healthy before
   * performing an incremental update.
   */
  async getObject(
    spaceId: string,
    objectId: string,
  ): Promise<{
    markdown: string;
    archived: boolean;
    properties: ObjectPropertyValue[];
  }> {
    const data = (await this._fetch(
      `/spaces/${spaceId}/objects/${objectId}`,
    )) as {
      object: {
        markdown: string;
        archived: boolean;
        properties: ObjectPropertyValue[];
      };
    };
    return data.object ?? {};
  }

  /** Permanently deletes an object. Called when the corresponding Zotero item is removed. */
  async deleteObject(spaceId: string, objectId: string): Promise<void> {
    await this._fetch(`/spaces/${spaceId}/objects/${objectId}`, {
      method: "DELETE",
    });
  }

  /** Lists all object types defined in a space (used to populate the preference pane dropdown). */
  async listTypes(spaceId: string): Promise<AnytypeObject[]> {
    const data = (await this._fetch(`/spaces/${spaceId}/types`)) as {
      data: AnytypeObject[];
    };
    return data.data ?? [];
  }

  /**
   * Lists properties (relations) defined in a space, with optional server-side
   * filtering by name substring. Used by `SpaceBoot` to check whether the
   * `Zotero Link` property already exists.
   */
  async listProperties(
    spaceId: string,
    filters?: { nameContains?: string },
  ): Promise<AnytypeProperty[]> {
    const params = new URLSearchParams();
    if (filters?.nameContains) {
      params.set("name[contains]", filters.nameContains);
    }
    const query = params.size > 0 ? `?${params}` : "";
    const data = (await this._fetch(
      `/spaces/${spaceId}/properties${query}`,
    )) as { data: AnytypeProperty[] };
    return data.data ?? [];
  }

  /**
   * Creates a new property in the space.
   * @returns The stable key of the newly created property.
   */
  async createProperty(
    spaceId: string,
    payload: Record<string, unknown>,
  ): Promise<string> {
    const data = (await this._fetch(`/spaces/${spaceId}/properties`, {
      method: "POST",
      body: JSON.stringify(payload),
    })) as { property: { key: string } };
    return data.property.key;
  }
}
