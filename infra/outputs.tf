output "server_ipv4" {
  description = "IP publica IPv4 del VPS Hetzner. Apuntar el A record del dominio aca."
  value       = hcloud_server.cluster.ipv4_address
}

output "server_ipv6" {
  description = "IP publica IPv6 del VPS Hetzner."
  value       = hcloud_server.cluster.ipv6_address
}

output "server_name" {
  value = hcloud_server.cluster.name
}

output "server_status" {
  value = hcloud_server.cluster.status
}

output "ssh_connect_hint" {
  description = "Comando SSH sugerido (con la key generada localmente)."
  value       = "ssh -i ~/.ssh/oke_nodes root@${hcloud_server.cluster.ipv4_address}"
}

output "kubeconfig_hint" {
  description = "Comando para bajar el kubeconfig una vez el server termino de bootear."
  value       = "ssh -i ~/.ssh/oke_nodes root@${hcloud_server.cluster.ipv4_address} 'cat /etc/rancher/k3s/k3s.yaml' | sed 's|127.0.0.1|${hcloud_server.cluster.ipv4_address}|' > ~/.kube/config-hetzner"
}
