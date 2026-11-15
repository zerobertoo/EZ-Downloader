# Como contribuir

Obrigado pelo interesse no EZ Downloader! Este guia resume como reportar problemas e enviar mudanças.

## Reportar um bug

Abra uma [issue de bug](https://github.com/zerobertoo/EZ-Downloader/issues/new/choose) e preencha o formulário. O mais útil para quem vai corrigir:

- a versão do app e o sistema operacional;
- o link (ou o site) que você tentou baixar;
- o texto de **Detalhes técnicos** do download que falhou: abra o card e expanda essa seção. Revise antes de colar, porque o log pode conter o link e o nome da pasta.

Antes de abrir, procure nas issues existentes se o problema já foi reportado.

Vulnerabilidades de segurança **não** vão em issue pública. Siga a [política de segurança](SECURITY.md).

### Sobre plataformas

O app roda em Windows, macOS e Linux, mas o desenvolvimento acontece principalmente no Windows. Pausa, retomada e agendamento de downloads não foram testados de verdade no macOS e no Linux, então relatos desses sistemas são especialmente bem-vindos.

### Sobre o YouTube

Boa parte das falhas vem do próprio yt-dlp ou do bloqueio anti-robô do YouTube, não do app. O app já atualiza o yt-dlp sozinho. Se o erro menciona cookies ou "não é um robô", veja em Ajustes a opção "Entrar com o navegador" (o Firefox costuma funcionar melhor que o Chrome).

## Sugerir uma funcionalidade

Abra uma [issue de sugestão](https://github.com/zerobertoo/EZ-Downloader/issues/new/choose) contando o problema que você quer resolver. Isso ajuda mais do que descrever só a solução.

O Modo Básico existe para ser direto: colar o link e baixar. Mudanças que compliquem esse fluxo tendem a ser recusadas ou a ir para o Modo Avançado.

## Enviar código

1. Faça um fork e crie uma branch a partir da `main`, com nome em inglês (ex.: `fix/playlist-selection`).
2. Rode o projeto e os testes localmente. Os comandos estão na seção "Para desenvolvedores" do [README](README.md).
3. Antes de abrir o PR, confira:

   ```bash
   npm test
   npx tsc --noEmit
   cargo fmt --manifest-path src-tauri/Cargo.toml --check
   cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
   cargo test --manifest-path src-tauri/Cargo.toml
   ```

4. Abra o PR contra a `main`. O CI roda sozinho, e o check **Validate** precisa passar para o merge.

A `main` é protegida: todo código entra por PR, nunca por push direto.

### Convenções

- **Commits** seguem [Conventional Commits](https://www.conventionalcommits.org/), com o tipo em inglês e a descrição em português: `feat(ui): adiciona atalho de teclado`, `fix: corrige cálculo de frete`.
- **Código** em inglês: nomes de variáveis, funções, arquivos e mensagens de log. Prefira nomes descritivos a nomes curtos.
- **Comentários e documentação** em português. Comente só o que o código não mostra, como uma restrição ou uma decisão não óbvia, sem repetir o que o nome já diz.
- **Testes** acompanham o comportamento novo ou corrigido. O frontend usa Vitest e o backend usa `cargo test`.

### Onde está cada coisa

- `src/`: frontend em TypeScript (interface, componentes e estado).
- `src-tauri/src/`: backend em Rust (fila, execução do yt-dlp, configurações e histórico).
- `site/`: página de download do projeto.
- `DESIGN.md` e `PRODUCT.md`: decisões de interface e do produto.
