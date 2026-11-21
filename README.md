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

## Catalog, Create e Inventory (supabase/004_catalog.sql)

1. No Supabase: SQL Editor → rode o arquivo `supabase/004_catalog.sql`.
2. Crie a conta **Owoxy** no site e rode (separado) para torná-la admin (só ela pode apagar itens do catálogo):
   `update public.profiles set is_admin = true where lower(username) = 'owoxy';`
3. Para testar compras: botão "Claim daily Owos" na Home (25 Owos a cada 24h).

- **Create**: Shirts / Pants (molde PNG 585x559, analisado antes do upload) e UGC (.obj ≤ 4000 triângulos, textura opcional ≤ 1024x1024).
- Preço em branco = **Offsale**, 0 = **Free**. O item criado vai direto para o inventário do criador.
- Comprar abre uma confirmação (Buy / Cancel). Itens comprados vão para o Inventory e podem ser vestidos no Avatar (aba Clothing).

## Premium, Limiteds, posição do UGC e Offsale (supabase/005_limiteds_premium.sql)

Rode `supabase/005_limiteds_premium.sql` no SQL Editor **depois** do 004 (pode rodar de novo sem problema).

- **Premium**: 100 Owos por dia (sem Premium: 25). A conta Owoxy dá Premium na página Premium (usuário + dias; 0 tira).
- **UGC**: o Owoxy posiciona o acessório sozinho (chapéu/cabelo em cima da cabeça, rosto no rosto, costas nas costas) e há controles para ajustar.
- **Limited / Limited Unique** (só a conta Owoxy, no Create): Limited pode ser revendido; Limited Unique tem estoque e cópias numeradas (#1, #2...). Revenda na página do item (vendedor recebe 70%, taxa de 30%).
- **Prazo de venda** (só Owoxy): "Available until" no Create ou na página do item.
- **Catalog**: itens Offsale ficam escondidos; o botão "Offsale items: Show / Don't show" muda isso (o navegador lembra).
