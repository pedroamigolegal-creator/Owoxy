// Aplica o tema salvo antes da página aparecer (evita piscar). Escuro é o padrão.
try { document.documentElement.dataset.theme = localStorage.getItem('owoxy.theme') === 'light' ? 'light' : 'dark'; } catch { document.documentElement.dataset.theme = 'dark'; }
