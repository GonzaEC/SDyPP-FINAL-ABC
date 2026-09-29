# OKE Basic (control plane gratuito, sin SLA — alcanza para el TP).
resource "oci_containerengine_cluster" "primary" {
  compartment_id     = var.compartment_ocid
  name               = var.cluster_name
  vcn_id             = oci_core_vcn.main.id
  # Version OKE actualizable con `oci ce cluster-options get --cluster-option-id all`.
  # v1.33.x es la default estable de OKE a 2026-09.
  kubernetes_version = "v1.34.10"
  type               = "BASIC_CLUSTER"

  cluster_pod_network_options {
    cni_type = "OCI_VCN_IP_NATIVE"
  }

  endpoint_config {
    subnet_id            = oci_core_subnet.api.id
    is_public_ip_enabled = true
  }

  options {
    service_lb_subnet_ids = [oci_core_subnet.lb.id]
    kubernetes_network_config {
      pods_cidr     = "10.244.0.0/16"
      services_cidr = "10.96.0.0/16"
    }
  }
}

# Always Free ARM Ampere A1 Flex: hasta 4 OCPU + 24 GB RAM total en la tenancy.
# Los repartimos en 4 nodos de 1 OCPU / 6 GB cada uno.
# Nota: OKE Always Free NO admite multiples node pools independientes con
# scale-to-zero como GKE/AKS; se hace un solo node pool y la separacion
# apps/infra/monitoring queda impuesta por node labels + taints aplicados a los
# nodos individuales via kubectl tras el bootstrap (ver k8s/README.md).

data "oci_identity_availability_domains" "ads" {
  compartment_id = var.tenancy_ocid
}

data "oci_core_images" "oracle_linux" {
  compartment_id           = var.compartment_ocid
  operating_system         = "Oracle Linux"
  operating_system_version = "8"
  shape                    = "VM.Standard.A1.Flex"
  sort_by                  = "TIMECREATED"
  sort_order               = "DESC"
}

resource "oci_containerengine_node_pool" "workers" {
  compartment_id     = var.compartment_ocid
  cluster_id         = oci_containerengine_cluster.primary.id
  name               = "workers"
  kubernetes_version = "v1.34.10"

  node_shape = "VM.Standard.A1.Flex"
  node_shape_config {
    ocpus         = 1 # Minimo: 1 nodo x 1 OCPU / 6 GB. Ultima chance de encontrar slot en Santiago.
    memory_in_gbs = 6
  }

  node_source_details {
    source_type             = "IMAGE"
    image_id                = data.oci_core_images.oracle_linux.images[0].id
    boot_volume_size_in_gbs = 50
  }

  node_config_details {
    size = 1 # Un solo nodo — request minima para pillar cualquier slot fragmentado.
    # Escalar despues si hay cupo: oci ce node-pool update --node-pool-id <id> --size N

    dynamic "placement_configs" {
      for_each = data.oci_identity_availability_domains.ads.availability_domains
      content {
        availability_domain = placement_configs.value.name
        subnet_id           = oci_core_subnet.nodes.id
      }
    }

    node_pool_pod_network_option_details {
      cni_type       = "OCI_VCN_IP_NATIVE"
      pod_subnet_ids = [oci_core_subnet.nodes.id]
    }
  }

  ssh_public_key = var.ssh_public_key
}
