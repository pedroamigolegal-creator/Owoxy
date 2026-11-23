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

## Taxa de 30%, Faces, UGC só da Owoxy e Settings (supabase/006_fees_faces_settings.sql)

Rode `supabase/006_fees_faces_settings.sql` no SQL Editor **depois** do 004 e do 005 (não rode o 005 de novo depois dele).

- **Vendas**: em toda compra (e revenda) 70% vai para quem criou/vendeu e 30% para a conta Owoxy (a conta com `is_admin`). Arredondamento: o criador recebe a parte inteira de 70% (5 Owos: 3 para o criador e 2 para a Owoxy). Se a Owoxy é a criadora, fica com tudo.
- **Create**: Shirts e Pants para todos; UGC e Faces só para a conta Owoxy (o servidor também confere).
- **UGC**: botão **Auto scale** (ajusta o tamanho ao boneco) além do auto-posicionamento.
- **Faces**: PNG quadrado (64 a 1024 px). Ao vestir, substitui o rosto do noob (aba Clothing do Avatar ou Inventory).
- **Settings**: Account Info (gênero, About), Security (trocar senha, sair de todos os aparelhos) e Privacy (quem pode mandar mensagem / pedido de amizade).

## Games: Talk To Others

`games.html` lists the games; `game.html` is **Talk To Others** (small town, up to 100 players per server).

- Before playing you choose **Computer** (WASD/arrows, Space, Enter to chat, Tab for the player list, Esc for the menu) or **Mobile** (joystick + JUMP button).
- Your own noob is used as an R6 character (head, torso, arms, legs animated: walk, jump, idle). Faces, shirts, pants and accessories are shown.
- Networking is Supabase **Realtime** (no new SQL): servers are channels `ttos-1`, `ttos-2`, ... Presence tells who is in; broadcast carries positions (~5/s) and chat. The 100-player cap is enforced by presence order: the 101st player goes to the next server.
- Limits to know: the Supabase free plan has Realtime message quotas, so 100 players moving at once is more than the free plan comfortably supports. Positions and chat are trusted from the client (no moderation or word filter yet).

Code: `js/game/` — `world.js` (town), `character.js` (R6 rig), `physics.js`, `net.js`, `main.js` (loading, controls, chat, menu); face/rig helpers in `js/rig.js`.

## Games: Natural Disaster Survival

`game.html?g=nds` — a recreation of the classic survival idea (original code and assets, not Roblox's). Players wait in a lobby; every round the host (first player in the server) picks one of 8 disasters: Earthquake, Meteor Shower, Tornado, Flood, Volcanic Eruption, Blizzard, Acid Rain, Thunderstorm. Climb buildings (spiral steps), hide under shelters, survive until the timer ends. Servers are Realtime channels `nds-1`, `nds-2`... (max 100). Round state is broadcast by the host; disasters are computed from a shared seed and time, and each player decides locally whether they died (client-trusted).

## Admin: Created Accounts

Run `supabase/007_created_accounts.sql`. The Owoxy (admin) account gets a "Created Accounts" item in the sidebar (`accounts.html`) listing username, creation date and time, gender, Owos and Premium. Passwords are intentionally not shown: Supabase stores only irreversible hashes, and storing plain-text passwords would expose every user.

## Moderation, reports and game pages (migration 008)

Run `supabase/008_moderation_games.sql` after 007. Only the **Owoxy** account can use these:

- **Created Accounts** (`accounts.html`): status filter and Ban / Unban / Delete / Undelete per account (admins are protected). Banned and deleted accounts cannot log in (`auth.users.banned_until` is set and their sessions are removed), disappear from search and profiles, and see the reason on the login page.
- **Reports** (`reports.html`): reports sent by players from the Esc menu inside the games, with Ban / Delete / Close.
- **Game pages** (`game-page.html?g=ttos|nds`): Play, like/dislike, favorite, visits, live server list with Join; `games.html` has Continue Playing, Favorites and All Games; the home page has Recommended For You.

Note: an access token that was already issued can keep working for up to about an hour after a ban; the site signs banned users out on the next page load.

## Presence, followers and Groups (migration 009)

Run `supabase/009_social_communities.sql` after 008.

- **Online / Playing** status: the site sends a heartbeat every minute (the games send which game you are in). Friends show a green dot (online) or blue dot (in game); profiles show the status line.
- **Followers / Following**: Follow button on profiles with counts next to Friends.
- **Groups** (`groups.html`, `community.html?id=`): search, create (100 Owos), join/leave, members list, edit description, delete (owner or Owoxy admin). Profiles list the groups a user is in.

## Sales and Owners (migration 010)

Run `supabase/010_item_stats.sql` after 009. Every catalog item shows **Sales** (store purchases and resales) and **Owners** (people who have a copy) on its page and on its card.

## Gear (migration 011)

Run `supabase/011_gear.sql` after 010. **Gear** is a new UGC accessory type (Create > UGC > type "Gear"). Whoever wears a Gear raises the right arm pointing forward, in the avatar editor and in the games. Model rule: the model's center is placed in the hand (auto-fit does this), front = -Z, size is auto-scaled to about 2.2 studs.

## Neck and 3 hats (migration 012)

Run `supabase/012_neck_hats.sql` after 011. **Neck** is a new UGC type (necklaces, scarves, ties; centered on the neck). You can now wear up to **3 hats** at once; equipping a 4th replaces the oldest one.

## Owos Adds (migration 013)

Run `supabase/013_owos_adds.sql` after 012. Only the Owoxy account sees **Owos Adds** in the menu: type an amount (quick buttons 1K+, 10K+, 100K+, 1M+, 1B+) and, optionally, a username to gift the Owos to someone else (empty = your own account). Every grant is logged in `owos_grants`. Balances in the top bar are shown as `1K+`, `1M+`, `1B+`.
