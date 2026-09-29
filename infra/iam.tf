# Dynamic Group: identifica a los worker nodes del OKE para poder darles
# permisos (equivalente al kubelet identity de AKS).
resource "oci_identity_dynamic_group" "oke_nodes" {
  compartment_id = var.tenancy_ocid
  name           = "sdypp-oke-nodes"
  description    = "Worker nodes del OKE sdypp-cluster"
  matching_rule  = "ALL {instance.compartment.id = '${var.compartment_ocid}'}"
}

# Policy que permite a los nodos leer imagenes del OCIR. OCIR (Oracle Container
# Registry) es tenancy-wide, no hay que crear un resource — solo autorizar el
# pull desde el compartment de nodos.
resource "oci_identity_policy" "oke_ocir_pull" {
  compartment_id = var.tenancy_ocid
  name           = "sdypp-oke-ocir-pull"
  description    = "Permite a los worker nodes pullear imagenes del OCIR"
  statements = [
    "Allow dynamic-group ${oci_identity_dynamic_group.oke_nodes.name} to read repos in tenancy",
  ]
}
