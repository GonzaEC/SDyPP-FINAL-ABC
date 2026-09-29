variable "hcloud_token" {
  description = "Hetzner Cloud API token (Project > Security > API Tokens > Read & Write)"
  type        = string
  sensitive   = true
}

variable "server_name" {
  description = "Nombre del server / cluster k3s"
  type        = string
  default     = "sdypp-cluster"
}

variable "server_type" {
  description = "Tipo de VPS (cpx22 = 2vCPU/4GB, cpx32 = 4vCPU/8GB, cpx42 = 8vCPU/16GB)"
  type        = string
  default     = "cpx32"
}

variable "location" {
  description = "Location Hetzner (nbg1 = Nuremberg, fsn1 = Falkenstein, hel1 = Helsinki, ash = Ashburn US, hil = Hillsboro US)"
  type        = string
  default     = "nbg1"
}

variable "image" {
  description = "OS image"
  type        = string
  default     = "ubuntu-24.04"
}

variable "ssh_public_key" {
  description = "SSH public key content (ssh-rsa ...) para acceso al server"
  type        = string
}

variable "domain" {
  description = "Dominio que apunta al server (informativo; el DNS se configura fuera de Terraform)"
  type        = string
  default     = "tesera.tech"
}
