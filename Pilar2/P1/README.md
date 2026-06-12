# Pasos para ejecutar el Hit 1
## 1. Requisitos

Tener instalado **Python 3**.

Verificar instalación:

```bash
python --version
```
Tener instalado **Docker**.

Verificar instalación:

```bash
docker --version
```
Instalar dependencias:

```bash
cd ./Integrador/Pilar2/P1
```

```
pip install -r requirements.txt
```
---
# 2. Seleccionar ubicacion del Hit 1
Abrir una terminal y ejecutar:
```bash
cd ./Integrador/Pilar2/P1
```
---
# 3. Aplicar API mediante kubernetes
```bash
cd ./k8s
```
---
```bash
kubectl apply -f deployment.yaml 
kubectl apply -f service.yaml
```
# 4. Habilitar port-forward

```bash
kubectl port-forward service/blockchain-api 8000:80 
```
---
# 5. probar API

```bash
http://localhost:8000/docs
```
---