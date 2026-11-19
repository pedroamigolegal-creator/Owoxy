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

## Estado atual: modo demo
As contas ficam salvas no `localStorage` do navegador (`js/auth.js`). Serve para testar visual e fluxo, **não** para produção: cada pessoa só vê as contas criadas no próprio navegador. O próximo passo é trocar `js/auth.js` por Supabase (mesmas funções) para ter contas reais.

## Configurações
`js/config.js`: nome da moeda, saldo inicial, idade mínima e modelo de avatar padrão.

## Créditos
Modelo 3D "Roblox Noob" por [vanyabro85](https://sketchfab.com/vanyabro85) ([Sketchfab](https://sketchfab.com/models/adbbe7953c1b4f678e1ee2f1033fcff1)), licença [CC BY 4.0](http://creativecommons.org/licenses/by/4.0/). Mantenha este crédito.

Owoxy não é afiliado à Roblox Corporation.
