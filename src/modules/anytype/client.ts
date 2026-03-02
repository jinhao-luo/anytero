const ANYTYPE_API_VERSION = "2025-11-08";

export interface AnytypeSpace {
  id: string;
  name: string;
}

export interface AnytypeObject {
  id: string;
  name: string;
}

export interface CreateObjectPayload {
  name: string;
  icon?: string;
  body?: string;
  type_key: string;
  properties?: Record<string, unknown>;
}

export interface UpdateObjectPayload {
  name?: string;
  body?: string;
  properties?: Record<string, unknown>;
}

export class AnytypeClient {
  private _baseUrl: string;
  private _apiKey: string;

  constructor(port: number, apiKey: string) {
    this._baseUrl = `http://127.0.0.1:${port}/v1`;
    this._apiKey = apiKey;
  }

  private _headers(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${this._apiKey}`,
      "Anytype-Version": ANYTYPE_API_VERSION,
    };
  }

  private async _fetch(path: string, options: RequestInit = {}): Promise<unknown> {
    const url = `${this._baseUrl}${path}`;
    const response = await fetch(url, {
      ...options,
      headers: { ...this._headers(), ...(options.headers as Record<string, string> ?? {}) },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`AnyType API error ${response.status}: ${body}`);
    }

    return response.json();
  }

  async listSpaces(): Promise<AnytypeSpace[]> {
    const data = await this._fetch("/spaces") as { data: AnytypeSpace[] };
    return data.data ?? [];
  }

  async createObject(spaceId: string, payload: CreateObjectPayload): Promise<string> {
    const data = await this._fetch(`/spaces/${spaceId}/objects`, {
      method: "POST",
      body: JSON.stringify(payload),
    }) as { object: { id: string } };
    return data.object.id;
  }

  async updateObject(spaceId: string, objectId: string, payload: UpdateObjectPayload): Promise<void> {
    await this._fetch(`/spaces/${spaceId}/objects/${objectId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  }

  async deleteObject(spaceId: string, objectId: string): Promise<void> {
    await this._fetch(`/spaces/${spaceId}/objects/${objectId}`, {
      method: "DELETE",
    });
  }

  async searchObjects(spaceId: string, filters: Record<string, unknown>): Promise<AnytypeObject[]> {
    const params = new URLSearchParams(
      Object.entries(filters).map(([k, v]) => [k, String(v)]),
    );
    const data = await this._fetch(`/spaces/${spaceId}/search?${params}`) as { data: AnytypeObject[] };
    return data.data ?? [];
  }

  async createType(spaceId: string, payload: Record<string, unknown>): Promise<string> {
    const data = await this._fetch(`/spaces/${spaceId}/types`, {
      method: "POST",
      body: JSON.stringify(payload),
    }) as { type: { key: string } };
    return data.type.key;
  }

  async createRelation(spaceId: string, payload: Record<string, unknown>): Promise<string> {
    const data = await this._fetch(`/spaces/${spaceId}/relations`, {
      method: "POST",
      body: JSON.stringify(payload),
    }) as { relation: { key: string } };
    return data.relation.key;
  }
}
