# Owoxy

Site de mundos e avatares inspirado em plataformas como o Roblox. Projeto independente.

## Páginas
- `index.html` – cadastro
- `login.html` – login
- `home.html` – página inicial (avatar noob 3D, amigos, menu lateral)

## Rodar no computador
Os módulos JS precisam de um servidor (não abre com duplo clique):

```bash
python3 -m http.server 8000
# abrir http://localhost:8000
```

## Publicar na Vercel
Site estático, sem build. Importe o repositório na Vercel e deixe "Framework Preset: Other" (sem build command, sem output directory).

## Contas e banco de dados: Supabase
O site usa o Supabase (login, perfis, amizades, mensagens). No **SQL Editor** do Supabase rode, nesta ordem, uma vez cada:
1. `supabase/schema.sql`
2. `supabase/002_avatar_verified.sql` (cores do avatar e selo de verificado)
3. `supabase/003_social.sql` (perfil "About", amizades, busca, mensagens e mensagem de boas-vindas)

Também: em **Authentication → Providers → Email**, deixe **"Confirm email" desligado** (o login é por nome de usuário; usamos um e-mail interno fictício). As chaves ficam em `js/config.js` (a chave "publishable" é pública por design; **nunca** coloque a `service_role` no site).

Selo de verificado (só você dá, pelo SQL Editor): `update public.profiles set verified = true where lower(username) = 'owoxy';`

Segurança: senhas ficam só no Supabase Auth; aniversário e saldo são privados; o navegador não escreve direto nas tabelas, só chama funções validadas no servidor.

## Configurações
`js/config.js`: nome da moeda, saldo inicial, idade mínima e modelo de avatar padrão.

## Créditos
Modelo 3D "Roblox Noob" por [vanyabro85](https://sketchfab.com/vanyabro85) ([Sketchfab](https://sketchfab.com/models/adbbe7953c1b4f678e1ee2f1033fcff1)), licença [CC BY 4.0](http://creativecommons.org/licenses/by/4.0/). Mantenha este crédito.

Owoxy não é afiliado à Roblox Corporation.
