# Preset de Stack — Kotlin Multiplatform (KMP)

> Bloco copiáveis com comando **real** da stack. Adapte module paths (`:app`, `:shared`,
> `:feature:foo`) ao layout do seu projeto. KMP = código comum (`commonMain/`) compilado para
> múltiplos targets (Android, iOS, JVM, JS); regras de Clean Architecture aplicam-se com força
> total à fronteira `commonMain` ↔ platform code.

## test_cmd

```bash
# Roda testes de commonMain (commonTest) + todos os targets com testes (jvmTest, androidUnitTest, iosSimulatorArm64Test...)
./gradlew test

# Roda só um target (mais rápido no loop interno):
./gradlew :shared:jvmTest
./gradlew :shared:testDebugUnitTest   # Android target
```

## cov_tool

Threshold **≥ 84%** por módulo. Usa **Kover** (Kotlin oficial, integra Gradle/KMP).

```bash
# Configura no build.gradle.kts do módulo: id("org.jetbrains.kotlinx.kover").
# Gera relatório agregado (common + targets JVM/Android):
./gradlew koverReport
# HTML: build/reports/kover/html/index.html
# Verifica limite programaticamente (falha o build se < 84%):
./gradlew koverVerify
```

Configure o bloco `kover { currentProject { verification { lineCoverageMin = 84 } } }` ou
`koverReport { filters { excludes { classes("*.generated.*") } } }` para excluir código gerado.

## mutation_tool

Threshold **≥ 84%**. **Pitest** (`pitest` Gradle plugin) é a ferramenta madura, mas só cobre o
lado **JVM** (bytecode). Para `commonMain` puro (Kotlin/Native, Kotlin/JS), Pitest não instrumenta.

```bash
# No build.gradle.kts: plugins { id("info.solidsoft.pitest") }
./gradlew pitest   # roda nos source sets JVM (jvmMain/androidMain)
# Relatório: build/reports/pitest/<index.html>
```

**Limite declarado:** código em `commonMain/` sem target JVM dedicado não é coberto pelo Pitest.
**Fallback de revisão manual** (quando Pitest não alcança): para funções puras de `commonMain`,
revisar manualmente os mutantes equivalentes — ler cada branch, confirmar que há teste que falharia
se a condição fosse invertida (ex.: trocar `&&` por `||`, `>` por `>=`, remover `return` early).
Documentar a revisão no PR quando `cargo mutants`/Pitest não cobrir.

## lint_cmd

```bash
# detekt (static analysis, code smell, complexidade):
./gradlew detekt
# Configura regras em config/detekt/detekt.yml.

# ktlint (formatação e estilo oficial Kotlin):
./gradlew ktlintCheck
# Auto-corrigir:
./gradlew ktlintFormat
```

Ambos podem rodar juntos via `./gradlew check` (que também roda testes).

## typecheck_cmd

Kotlin é estaticamente tipado; o check happens no compile. Para verificar tipos sem gerar artefatos:

```bash
./gradlew compileKotlinJvm compileDebugKotlin   # compila sem empacotar
# Para Kotlin/Native:
./gradlew compileKotlinIosSimulatorArm64
```

## build_cmd

```bash
# Build completo (todas as tasks: test, lint, assemble, verifica):
./gradlew build

# Artefato Android (APK/AAB):
./gradlew :app:assembleDebug
./gradlew :app:bundleRelease

# Framework iOS (XCFramework) gerado pelo KMP:
./gradlew :shared:assembleXCFramework
```

## run_dev_cmd

```bash
# Android (emulador ou device conectado):
./gradlew :app:installDebug
adb shell am start -n <package>/<activity>   # ou via Android Studio "Run"

# iOS: abre no Xcode o workspace gerado e roda no simulador:
open ios-app/iosApp.xcworkspace   # depois Cmd+R no Xcode

# Hot-reload de UI (Compose Multiplatform): plugin "Compose Hot Reload" ou live-edit do IDE.
```

## file_glob

Arquivos Kotlin sujeitos à Regra 1 (≤ 300 / teto 500 linhas):

- `**/*.kt`

Roots a auditar: `commonMain/`, `androidMain/`, `iosMain/`, `jvmMain/`, `:app/src`, `:feature:*/src`.

```bash
# Lista violações (> 500 linhas):
find . -name '*.kt' -not -path '*/build/*' -exec wc -l {} + | sort -rn | awk '$1 > 500'
```

## arch_violation_grep

Markers de framework/IO (Regra 3/4): **`commonMain/` (domain/application) não pode importar
plataforma específica nem SDK de IO**. Platform code (`androidMain`, `iosMain`, `jvmMain`) tem
permissão, mas só via `expect/actual` declarations de ports definidos em `commonMain`.

```bash
# domain/application de commonMain importando plataforma/IO = violação
rg -l 'android\.|java\.io|java\.net|javax\.|kotlinx\.coroutines\.Dispatchers\.(IO|Default)|retrofit2|okhttp3|androidx\.|com\.android' \
  shared/src/commonMain/kotlin/**/domain shared/src/commonMain/kotlin/**/application
# Esperado: vazio.

# Platform code referenciando domain/application fora de ports = acoplamento errado
rg -l 'import .*\.(domain|application)\.' shared/src/androidMain shared/src/iosMain | \
  rg -v 'infrastructure|adapter|di'
```

> `expect`/`actual` é o mecanismo canônico de injeção de plataforma em KMP: declare `expect fun
> now(): Instant` em `commonMain`, implemente `actual` em cada target. Domain depende da abstração.

## conventions

- **Idioma:** pt-BR para UI/comentários/erros; inglês para identificadores (`fun`, `class`,
  `package`, `val`).
- **Layout:** `shared/` (módulo KMP com `commonMain` + targets) + `:app-android` + `ios-app/`
  consumindo o `shared` via CocoaPods ou SPM. Features em `:feature:<nome>`.
- **DI:** preferir `kotlin-inject` ou Koin Multiplatform — ambos suportam KMP. Construtor
  injection com interfaces (ports) em `commonMain`, bindings concretos em platform code.
- **Coroutines:** `kotlinx.coroutines` é comum. Em `commonMain`, use `CoroutineDispatcher` como
  port injetado — nunca chame `Dispatchers.IO` (é JVM-only) direto em domain.
- **Testes de commonTest:** `kotlin.test` + `kotlinx-coroutines-test`. Para testar código que
  depende de plataforma, forneça `expected`/`actual` fakes ou confie em targets JVM para cobertura.
- **Serialização:** `kotlinx.serialization` com `@Serializable` — canônico em KMP.
- **Compose Multiplatform:** se usar UI declarativa multiplatform, `@Composable` em `commonMain`;
  tema e navigator injetados (não hardcoded por plataforma no domain).
- **Mutation gap em `commonMain`:** documente no PR quando Pitest não cobrir — revisão manual de
  branches é o fallback aceito (ver `mutation_tool` acima).

## Exemplo: fronteira Clean Architecture em KMP

```
shared/src/
  commonMain/kotlin/com/acme/foo/
    domain/model/Foo.kt
    domain/port/FooRepository.kt         # interface (port)
    application/SaveFooUseCase.kt
  androidMain/kotlin/com/acme/foo/
    infrastructure/FooRoomRepository.kt  # implementa FooRepository
  iosMain/kotlin/com/acme/foo/
    infrastructure/FooCoreDataRepository.kt
```

`SaveFooUseCase` depende de `FooRepository` (interface), nunca de Room/Realm/CoreData. O adapter
concreto é escolhido em cada target.
