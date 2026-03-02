const ANYTYPE_API_VERSION = "2025-11-08";

export interface AnytypeSpace {
  id: string;
  name: string;
}

export interface AnytypeObject {
  id: string;
  name: string;
}

export interface AnytypeProperty {
  key: string;
  name: string;
  format: string;
}

export type PropertyWithValue =
  | { key: string; url: string }
  | { key: string; text: string }
  | { key: string; number: number }
  | { key: string; checkbox: boolean };

export interface CreateObjectPayload {
  name: string;
  icon?: string;
  body?: string;
  type_key: string;
  properties?: PropertyWithValue[];
}

export interface UpdateObjectPayload {
  name?: string;
  body?: string;
  properties?: PropertyWithValue[];
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

  async listSpaces(): Promise<AnytypeSpace[]> {
    const data = (await this._fetch("/spaces")) as { data: AnytypeSpace[] };
    return data.data ?? [];
  }

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

  async updateObject(
    spaceId: string,
    objectId: string,
    payload: UpdateObjectPayload,
  ): Promise<void> {
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

  async listTypes(spaceId: string): Promise<AnytypeObject[]> {
    const data = (await this._fetch(`/spaces/${spaceId}/types`)) as {
      data: AnytypeObject[];
    };
    return data.data ?? [];
  }

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
