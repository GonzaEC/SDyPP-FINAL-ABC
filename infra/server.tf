# Un solo VPS que hostea todo el cluster k3s.
# Es la topologia real del deploy productivo — ver ADR-029.

resource "hcloud_ssh_key" "main" {
  name       = "${var.server_name}-key"
  public_key = var.ssh_public_key
}

# Firewall que expone solo los puertos que consumen las apps y el API de k3s.
# Todo el resto queda cerrado desde internet (los pods se hablan por la red
# interna de k3s, sin pasar por el firewall externo).
resource "hcloud_firewall" "main" {
  name = "${var.server_name}-fw"

  # SSH (bootstrap + operacion)
  rule {
    direction  = "in"
    protocol   = "tcp"
    port       = "22"
    source_ips = ["0.0.0.0/0", "::/0"]
  }

  # Kubernetes API (kubectl desde fuera del cluster)
  rule {
    direction  = "in"
    protocol   = "tcp"
    port       = "6443"
    source_ips = ["0.0.0.0/0", "::/0"]
  }

  # HTTP (Traefik built-in de k3s; redirige a HTTPS)
  rule {
    direction  = "in"
    protocol   = "tcp"
    port       = "80"
    source_ips = ["0.0.0.0/0", "::/0"]
  }

  # HTTPS (Traefik built-in de k3s)
  rule {
    direction  = "in"
    protocol   = "tcp"
    port       = "443"
    source_ips = ["0.0.0.0/0", "::/0"]
  }

  # AMQPS - RabbitMQ (workers GPU del cluster del profesor se conectan aca)
  rule {
    direction  = "in"
    protocol   = "tcp"
    port       = "5671"
    source_ips = ["0.0.0.0/0", "::/0"]
  }

  # Redis (workers GPU del cluster del profesor se conectan aca)
  rule {
    direction  = "in"
    protocol   = "tcp"
    port       = "6379"
    source_ips = ["0.0.0.0/0", "::/0"]
  }
}

resource "hcloud_server" "cluster" {
  name         = var.server_name
  server_type  = var.server_type
  image        = var.image
  location     = var.location
  ssh_keys     = [hcloud_ssh_key.main.id]
  firewall_ids = [hcloud_firewall.main.id]

  # cloud-init: instala k3s al boot y etiqueta el nodo con pool=apps.
  # Idempotente; si el server se recrea, k3s se instala de nuevo desde cero.
  user_data = <<-EOF
    #!/bin/bash
    set -eux

    # Instalar k3s (single-node; sin componentes deshabilitados — Traefik
    # built-in queda como ingress controller).
    curl -sfL https://get.k3s.io | sh -

    # Etiquetar el nodo con pool=apps para que los nodeSelector de los
    # manifests encuentren donde programar. Ver k8s/README.md.
    until kubectl get nodes 2>/dev/null | grep -q Ready; do sleep 2; done
    NODE=$(kubectl get nodes -o jsonpath='{.items[0].metadata.name}')
    kubectl label node "$NODE" pool=apps --overwrite

    # Namespace de la app
    kubectl create namespace sdypp --dry-run=client -o yaml | kubectl apply -f -
  EOF

  labels = {
    project = "sdypp"
    stack   = "k3s"
  }
}
