resource "google_artifact_registry_repository" "docker" {
  location      = var.region
  repository_id = var.repo_name
  format        = "DOCKER"
  description   = "Docker images for SDyPP blockchain platform"
}
