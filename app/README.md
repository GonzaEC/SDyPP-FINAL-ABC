# App Web — Plataforma de Entradas con Blockchain

Aplicación full-stack en Next.js 16 que gestiona eventos, emite entradas como activos
criptográficos en una blockchain propia, y permite compra, reventa y validación en puerta.

**URL de producción:** https://tesera.tech

## Stack

- **Next.js 16** App Router + TypeScript estricto
- **Tailwind 4** para estilos
- **Prisma 7** + PostgreSQL 17 (driver adapter)
- **iron-session** para sesiones server-side
- **MercadoPago** Checkout Pro para pagos
- **WebCrypto API** para ECDSA P-256

## Modelo criptográfico

Cada usuario tiene un **par de claves ECDSA P-256** generado en el browser con WebCrypto:

- La **clave pública** es su identidad on-chain (como una wallet address).
- La **clave privada** se cifra con AES-GCM (derivada de la password con PBKDF2, 250K
  iteraciones) y se guarda cifrada en el servidor. **Nunca se descifra fuera del browser.**
- Si el usuario olvida la password, pierde la clave privada. No hay recovery.

Ver ADRs [001](docs/adr/001-identidad-ecdsa.md), [002](docs/adr/002-custodia-hibrida-clave.md),
[003](docs/adr/003-formato-firma-p1363.md).

## Páginas

| Ruta | Acceso | Función |
|------|--------|---------|
| `/` | Público | Landing page |
| `/events` | Público | Cartelera de eventos con filtros |
| `/events/[id]` | Público | Detalle del evento, compra de entrada |
| `/panel` | Público | Monitor de blockchain en tiempo real |
| `/login` | Público | Login (email + password → descifra clave privada) |
| `/register` | Público | Registro (genera keypair ECDSA) |
| `/dashboard` | Organizador | Dashboard: eventos propios, emisión, minting |
| `/dashboard/events/new` | Organizador | Crear evento |
| `/dashboard/events/[id]/edit` | Organizador | Editar evento |
| `/my-tickets` | Autenticado | Mis entradas, listar para reventa |
| `/scan` | Organizador | Escáner QR para validación en puerta |

## API Endpoints

### Auth
| Método | Ruta | Función |
|--------|------|---------|
| POST | `/api/auth/register` | Registra usuario, guarda clave cifrada |
| POST | `/api/auth/login` | Autentica, devuelve blob cifrado de clave privada |
| POST | `/api/auth/logout` | Cierra sesión |
| GET | `/api/me` | Usuario actual |
| GET | `/api/me/unlock-blob` | Blob cifrado para re-descifrar clave |

### Eventos
| Método | Ruta | Función |
|--------|------|---------|
| GET/POST | `/api/events` | Listar / crear eventos |
| GET/PATCH/DELETE | `/api/events/[id]` | CRUD de evento |
| GET | `/api/events/[id]/emit/prepare` | Payload a firmar para emitir |
| POST | `/api/events/[id]/emit` | Emitir entradas (firma ECDSA → mint on-chain) |
| POST | `/api/events/[id]/checkout` | Crear preferencia MercadoPago |
| POST | `/api/events/[id]/buy` | Compra mock (sin MP) |

### Blockchain
| Método | Ruta | Función |
|--------|------|---------|
| GET | `/api/blockchain` | Estado de la blockchain (proxy al NCT) |
| GET | `/api/operations/[opId]` | Estado de una operación on-chain |
| POST | `/api/validate` | Validar entrada en puerta (QR firmado) |

### Pagos
| Método | Ruta | Función |
|--------|------|---------|
| POST | `/api/payments/webhook` | Webhook de MercadoPago |
| GET | `/api/payments/[paymentId]` | Estado de un pago |

### Reventa
| Método | Ruta | Función |
|--------|------|---------|
| GET | `/api/events/[id]/listings` | Listings activos de un evento |
| POST/DELETE | `/api/tickets/[id]/list` | Crear / cancelar listing de reventa |
| POST | `/api/listings/[id]/checkout` | Checkout de reventa via MP |

## Estructura del código

```
src/
├── app/                          # Next.js App Router
│   ├── api/                      # API routes (server-side)
│   │   ├── auth/                 # Register, login, logout
│   │   ├── events/[id]/          # CRUD + emit + checkout
│   │   ├── blockchain/           # Proxy al NCT
│   │   ├── payments/             # Webhook MP
│   │   ├── validate/             # Validación en puerta
│   │   └── ...
│   ├── dashboard/                # Panel organizador
│   ├── events/                   # Páginas de eventos
│   ├── panel/                    # Monitor blockchain
│   ├── my-tickets/               # Mis entradas
│   ├── scan/                     # Escáner QR
│   └── layout.tsx                # Layout principal con nav
├── lib/                          # Librerías compartidas
│   ├── crypto/
│   │   ├── client.ts             # WebCrypto: keygen, cifrado, firma (browser)
│   │   ├── server.ts             # Verificación de firma (server)
│   │   └── common.ts             # canonicalize(), randomBytes(), base64
│   ├── nct/
│   │   ├── client.ts             # Cliente NCT (mock + real)
│   │   └── wait.ts               # Polling de operaciones
│   ├── payments/
│   │   └── mercadopago.ts        # SDK MercadoPago
│   ├── db.ts                     # Prisma singleton con driver adapter
│   ├── session.ts                # iron-session
│   └── identity-store.ts         # Store in-memory de CryptoKey
├── components/                   # Componentes React reutilizables
└── generated/                    # Prisma client generado
```

## Ciclo de vida de una entrada

```
1. DRAFT        → Organizador crea evento
2. MINTING      → Firma mint_batch → NCT acepta → workers minan
3. EMITTED      → Bloque confirmado → N tickets materializados en DB
4. COMPRA       → Asistente paga (MP) → transfer on-chain org→comprador
5. VALIDACIÓN   → QR firmado → transfer on-chain comprador→org (= "usada")
```

## Integración con la blockchain (NCT)

El cliente en `lib/nct/client.ts` soporta dos modos:

- **Mock** (`NCT_URL` vacío o `"mock"`): simula delays y confirmaciones localmente.
  Útil para desarrollo sin levantar la blockchain.
- **Real** (`NCT_URL=http://blockchain-nct`): llama a los endpoints del NCT real.
  Las operaciones son async (202 Accepted → polling hasta CONFIRMED).

Ver ADR [018](docs/adr/018-contrato-nct-ownership.md) para el contrato completo.

## Decisiones de arquitectura

Todas documentadas en [`docs/adr/`](docs/adr/). Las más importantes:

- [001](docs/adr/001-identidad-ecdsa.md) — Identidad por ECDSA P-256
- [005](docs/adr/005-validacion-como-transferencia.md) — Validación = transferencia
- [016](docs/adr/016-integracion-mercadopago.md) — MercadoPago Checkout Pro
- [018](docs/adr/018-contrato-nct-ownership.md) — Contrato NCT + ownership

## Cómo correr

```bash
# Dev (solo app + Postgres)
docker compose up -d postgres
npm install
npm run dev

# Producción (Docker)
docker compose up

# Tests
npm test
```
