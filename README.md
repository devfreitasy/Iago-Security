# Iago Security

Central de Segurança offline-first para criação, distribuição, importação e leitura controlada de mensagens protegidas.

## Recursos principais

- autenticação gerenciada pela plataforma e ambientes Administrador/Usuário;
- criptografia AES-GCM 256 com chaves derivadas por PBKDF2 SHA-256;
- exportação e importação real de arquivos `.securemsg`;
- verificação de integridade SHA-256, destinatário, expiração e duplicidade;
- persistência local em IndexedDB e sincronização versionada com D1;
- PWA com cache offline, fila local e recuperação após falha de rede;
- gestão de colaboradores, atividades, backup cifrado, filtros e busca global;
- árvore binária de busca balanceada para indexação de mensagens, com percurso em pós-ordem (esquerda, direita, raiz) e visualização interativa;
- interface responsiva, acessível e adaptada a `prefers-reduced-motion`.

## Desenvolvimento

```bash
pnpm install
pnpm run dev
```

## Validação

```bash
pnpm exec tsc --noEmit
pnpm run lint
pnpm run test:crypto
pnpm run build
```

Os testes cobrem cifragem e decifragem, árvore binária, rejeição de código incorreto, adulteração, expiração, acesso único, backup e resolução de conflitos.

## Onde a árvore binária é usada

- opção **Árvore pós-ordem** no menu administrativo;
- indexação e listagem das mensagens em pós-ordem;
- busca por título com caminho e número de comparações;
- visualização interativa: passar o mouse ou focar um nó mostra o percurso até ele;
- confirmação de indexação após criar uma mensagem;
- posição do nó nos detalhes de cada mensagem;
- resumo do índice na visão geral e consulta estruturada por WebMCP.

## Limites de segurança

O Iago Security utiliza primitivas criptográficas reais da Web Crypto API. A segurança de arquivos protegidos depende da força e do sigilo do código de acesso. O projeto não substitui gestão corporativa de chaves, auditoria independente ou infraestrutura certificada.
