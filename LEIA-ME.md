# G-TV para Cloudflare Workers — candidata 1.0.1

## Conteúdo do ZIP: seis arquivos
Essenciais: worker.mjs, wrangler.toml, package.json.
Opcionais: test.mjs (testes), LEIA-ME.md (este guia), .gitignore.
O logo JPEG está embutido no worker.mjs: não é preciso enviar imagem separada.

## Publicação pelo celular
1. Crie um repositório separado no GitHub: gtv-workers. Preserve o projeto Node original.
2. Extraia o ZIP. Envie os três arquivos essenciais na raiz do repositório. Os três opcionais podem ser enviados também. Não envie apenas o ZIP e não copie o package-lock.json antigo.
3. No painel Cloudflare, em Workers & Pages, importe o repositório como Worker, não como site Pages estático.
4. Nome do Worker: gtv-workers, igual ao name no wrangler.toml. Branch: a principal do repositório.
5. Raiz: pasta com wrangler.toml. Build command: vazio. Deploy command: npx wrangler deploy.
6. Publique e acompanhe os logs. Não é necessário instalar Wrangler no Termux: Workers Builds executa o comando remotamente.
7. PUBLIC_URL é opcional: o Worker utiliza por padrão a origem da requisição HTTPS.
8. Teste a URL gerada com /health, /manifest.json e /logo.jpeg.
9. Teste /catalog/tv/cam4br.json e /catalog/tv/stripchatbr.json.
10. Instale a URL completa de /manifest.json no Stremio/Nuvio e teste imagens e reprodução.

Documentação oficial: https://developers.cloudflare.com/workers/ci-cd/builds/

## Testes e limites
Sintaxe conferida com Node. 17 verificações locais com respostas simuladas passaram. Não foram executados deploy, Wrangler, reprodução real ou benchmark do limite de CPU gratuito. A decodificação MOUFLON foi preservada, mas não foi validada com playlist real ou fixture criptografada.
O manifesto abrir não comprova funcionamento de imagens ou reprodução.
O Worker usa nodejs_compat para Buffer e node:crypto. Os sites podem bloquear IPs da Cloudflare. Os termos dos provedores ainda precisam ser verificados para esse uso.

## Tráfego
CAM4 entrega URL HLS direta. Stripchat busca e reescreve playlists e mantém segmentos apontando ao CDN de origem: não há proxy de segmentos neste código. Imagens CAM4 e fallbacks de imagens Stripchat podem passar pelo Worker.
Cache do catálogo é apenas em memória por instância, não persistente nem global.

## Alterações
Servidor substituído por handler fetch e roteador mínimo. Logo incorporado com Content-Type JPEG. URLs relativas de playlists resolvidas. Mantida restrição de domínios do proxy. Removida dependência de PUBLIC_URL com hostname Fly e porta concatenada.
