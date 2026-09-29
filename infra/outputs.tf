output "cluster_id" {
  value = oci_containerengine_cluster.primary.id
}

output "cluster_name" {
  value = oci_containerengine_cluster.primary.name
}

output "cluster_endpoint" {
  value     = oci_containerengine_cluster.primary.endpoints[0].public_endpoint
  sensitive = true
}

output "region" {
  value = var.region
}

output "ocir_registry" {
  description = "URL del OCIR para pushear imagenes"
  value       = "${var.region == "sa-santiago-1" ? "scl" : var.region}.ocir.io/${var.ocir_namespace}"
}

output "vcn_id" {
  value = oci_core_vcn.main.id
}

output "node_pool_id" {
  value = oci_containerengine_node_pool.workers.id
}
