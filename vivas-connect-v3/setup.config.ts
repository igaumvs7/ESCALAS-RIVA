export type CredentialField = {
  key: string;
  label: string;
  helpText?: string;
  docsUrl?: string;
  placeholder?: string;
  inputType?: 'text' | 'password';
  validate: (value: string) => Promise<{ ok: boolean; message?: string }>;
};

export type SetupConfig = {
  toolName: string;
  toolSlug: string;
  appCredentials: CredentialField[];
  postBootstrapRedirect: string;
};

const ok = { ok: true } as const;

async function validateOpenAI(value: string) {
  if (!value.startsWith('sk-')) {
    return { ok: false, message: 'A chave OpenAI deve comecar com sk-.' };
  }
  const res = await fetch('https://api.openai.com/v1/models', {
    headers: { Authorization: `Bearer ${value}` },
  });
  return res.ok
    ? ok
    : { ok: false, message: 'Chave OpenAI invalida ou sem permissao.' };
}

async function validateAnthropic(value: string) {
  if (!value.startsWith('sk-ant-')) {
    return { ok: false, message: 'A chave Anthropic deve comecar com sk-ant-.' };
  }
  const res = await fetch('https://api.anthropic.com/v1/models', {
    headers: {
      'x-api-key': value,
      'anthropic-version': '2023-06-01',
    },
  });
  return res.ok
    ? ok
    : { ok: false, message: 'Chave Anthropic invalida ou sem permissao.' };
}

async function validateGemini(value: string) {
  if (!value.startsWith('AIza')) {
    return { ok: false, message: 'A chave Gemini normalmente comeca com AIza.' };
  }
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(value)}`,
  );
  return res.ok
    ? ok
    : { ok: false, message: 'Chave Gemini invalida ou sem permissao.' };
}

export const setupConfig: SetupConfig = {
  toolName: 'VIVAS CONNECT',
  toolSlug: 'whatsapp-hub',
  postBootstrapRedirect: '/dashboard',
  // WhatsApp conecta via webjs/Baileys (QR code, dentro do CRM em Vivas
  // Envia) — não é uma credencial coletada aqui no wizard. Zernio e UAZAPI
  // (API oficial paga / segundo número) foram descontinuados por completo
  // em 2026-08-22 (decisão de negócio — ver CLAUDE.md) e seus campos de
  // credencial removidos daqui nesta limpeza (2026-08-26): não sobrou
  // nenhum código vivo lendo `zernio_api_key`/`uazapi_server_url`/
  // `uazapi_instance_token` — eram só definições de campo órfãs, sem
  // nenhuma tela que ainda as renderizasse.
  appCredentials: [
    {
      key: 'openai_api_key',
      label: 'OpenAI API Key',
      placeholder: 'sk-...',
      inputType: 'password',
      docsUrl: 'https://platform.openai.com/api-keys',
      helpText: 'Obrigatoria para embeddings e transcricao de audio (Whisper).',
      validate: validateOpenAI,
    },
    {
      key: 'llm_provider',
      label: 'LLM Provider',
      placeholder: 'openai',
      inputType: 'text',
      helpText: 'openai, claude ou gemini. Deixe vazio para usar openai (padrao).',
      validate: async (value) => {
        const v = value.trim();
        if (!v) return ok; // vazio = padrao openai
        return ['openai', 'claude', 'gemini'].includes(v)
          ? ok
          : { ok: false, message: 'Use openai, claude ou gemini.' };
      },
    },
    {
      key: 'llm_api_key',
      label: 'LLM API Key',
      placeholder: 'sk-...',
      inputType: 'password',
      helpText:
        'Chave do provider de chat. Obrigatoria apenas se o provider nao for OpenAI; com OpenAI, reusa a OpenAI API Key.',
      validate: async (value) => {
        const v = value.trim();
        if (!v) return ok; // vazio: cai na OpenAI API Key quando provider = openai
        if (v.startsWith('sk-ant-')) return validateAnthropic(v);
        if (v.startsWith('AIza')) return validateGemini(v);
        return validateOpenAI(v);
      },
    },
    {
      key: 'app_url',
      label: 'App URL',
      placeholder: 'https://seu-app.vercel.app',
      inputType: 'text',
      helpText: 'Opcional. URL publica usada em links de convite. Derivada do deploy se vazia.',
      validate: async (value) => {
        const v = value.trim();
        if (!v) return ok; // opcional
        return /^https:\/\/.+/i.test(v)
          ? ok
          : { ok: false, message: 'Informe uma URL HTTPS publica.' };
      },
    },
  ],
};
