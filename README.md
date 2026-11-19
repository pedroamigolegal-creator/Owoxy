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

## Contas: Supabase (ou modo demo)
`js/auth.js` escolhe sozinho:
- **Sem chaves** em `js/config.js` → modo demo (contas só no `localStorage` do navegador; serve para testar).
- **Com chaves** → contas reais no Supabase.

### Ligar o Supabase
1. Crie um projeto grátis em https://supabase.com.
2. Em **SQL Editor**, cole e rode o conteúdo de `supabase/schema.sql`.
3. Em **Authentication → Providers → Email**, **desligue "Confirm email"** (o login é por nome de usuário, usamos um e-mail interno fictício).
4. Em **Project Settings → API**, copie a **Project URL** e a **anon public key** e cole em `SUPABASE` no `js/config.js`. A anon key é pública por design, pode ir pro GitHub. **Nunca** coloque a `service_role` key no site.
5. Faça commit/push; a Vercel publica sozinha.

Segurança: senhas ficam só no Supabase Auth; aniversário e saldo são privados; o navegador não consegue alterar saldo (só o servidor, em passos futuros).

## Configurações
`js/config.js`: nome da moeda, saldo inicial, idade mínima e modelo de avatar padrão.

## Créditos
Modelo 3D "Roblox Noob" por [vanyabro85](https://sketchfab.com/vanyabro85) ([Sketchfab](https://sketchfab.com/models/adbbe7953c1b4f678e1ee2f1033fcff1)), licença [CC BY 4.0](http://creativecommons.org/licenses/by/4.0/). Mantenha este crédito.

Owoxy não é afiliado à Roblox Corporation.
