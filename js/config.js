// Configurações gerais do Owoxy
// Chaves do Supabase (Project Settings > API). A "anon key" é pública por design, pode ficar no GitHub.
// Deixe vazio para usar o modo demo (contas só no navegador).
export const SUPABASE = {
  url: 'https://jhucuqybjgrecymgqngd.supabase.co',
  anonKey: 'sb_publishable_NxRVqxatf2NHyquSsD8yqA_m7Pn5EzQ',
};

export const CONFIG = {
  siteName: 'Owoxy',
  currencyName: 'Owos',   // nome da moeda do site (pode trocar)
  startingBalance: 0,     // saldo inicial de quem cria conta
  minAge: 13,             // idade mínima para criar conta
  defaultAvatar: 'assets/noob/scene.gltf',
};
