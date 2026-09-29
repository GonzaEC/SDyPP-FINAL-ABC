variable "tenancy_ocid" {
  description = "OCID de la tenancy (Profile > Tenancy en la consola)"
  type        = string
}

variable "user_ocid" {
  description = "OCID del usuario que corre Terraform (Profile > User Settings)"
  type        = string
}

variable "fingerprint" {
  description = "Fingerprint de la API key publica cargada en el usuario"
  type        = string
}

variable "private_key_path" {
  description = "Path local al archivo .pem de la private key correspondiente al fingerprint"
  type        = string
}

variable "region" {
  description = "Region de OCI (home region de la tenancy)"
  type        = string
  default     = "sa-santiago-1"
}

variable "compartment_ocid" {
  description = "OCID del compartment donde crear los recursos (puede ser el root de la tenancy)"
  type        = string
}

variable "cluster_name" {
  description = "Nombre del cluster OKE"
  type        = string
  default     = "sdypp-cluster"
}

variable "ocir_namespace" {
  description = "Namespace de OCIR (autogenerado por Oracle, usualmente coincide con el tenancy name en minusculas). Sacalo con: oci os ns get"
  type        = string
}

variable "ssh_public_key" {
  description = "SSH public key content (pega el contenido del ~/.ssh/id_rsa.pub o generalo con ssh-keygen)"
  type        = string
}

variable "github_repo" {
  description = "Repo GitHub owner/name (informativo)"
  type        = string
  default     = "GonzaEC/SDyPP-FINAL-ABC"
}
