# ADR-020: HTTPS con GKE Managed Certificate y dominio propio

**Estado:** Accepted
**Fecha:** 2026-06-22

## Contexto

La app usa WebCrypto (`crypto.subtle`) para generar claves ECDSA y firmar transacciones.
WebCrypto requiere un **secure context** (HTTPS o localhost). Sin HTTPS, el browser tira
`crypto.subtle is undefined` y el flujo de registro/emisión/validación no funciona.

Necesitábamos HTTPS rápido, sin gestionar certificados manualmente.

## Decisión

Usamos **GKE Managed Certificates** con un dominio propio (`tesera.tech`):

1. Registramos `tesera.tech` en `.tech domains`.
2. Reservamos una IP estática global en GCP (`frontend-ip`: 34.160.1.16).
3. Apuntamos el registro A de `tesera.tech` a esa IP.
4. Creamos un recurso `ManagedCertificate` que GCP provisiona y renueva automáticamente.
5. Un `Ingress` con la anotación `networking.gke.io/managed-certificates` rutea HTTPS al
   frontend service (NodePort).

## Consecuencias

### Positivas
- HTTPS funciona sin gestionar certificados (GCP los renueva automáticamente).
- WebCrypto funciona en el browser, desbloqueando todo el flujo crypto.
- Dominio propio profesional para la defensa.

### Negativas
- El Ingress consume una IP global y una forwarding rule, que cuentan contra la quota
  `IN_USE_ADDRESSES` (límite 4 en el free tier).
- El provisionamiento del certificado tarda 10-30 minutos la primera vez.

### Abiertas
- Si se necesita un segundo dominio (ej. `api.tesera.tech`), hay que agregar otro
  ManagedCertificate y un rule en el Ingress.

## Alternativas consideradas

### A. Let's Encrypt con cert-manager
Más control pero requiere instalar cert-manager en el cluster, más complejidad operativa.

### B. Cloudflare proxy
Gratis y rápido, pero agrega un hop extra y puede interferir con WebSocket/SSE futuros.
