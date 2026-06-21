# Service account for GKE workloads
resource "google_service_account" "gke_workloads" {
  account_id   = "gke-workloads"
  display_name = "GKE Workloads SA"
}

# Allow GKE nodes to pull images from Artifact Registry
resource "google_project_iam_member" "gke_ar_reader" {
  project = var.project_id
  role    = "roles/artifactregistry.reader"
  member  = "serviceAccount:${google_service_account.gke_workloads.email}"
}

# Workload Identity binding: K8s SA → GCP SA
resource "google_service_account_iam_member" "workload_identity" {
  service_account_id = google_service_account.gke_workloads.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "serviceAccount:${var.project_id}.svc.id.goog[default/default]"

  depends_on = [google_container_cluster.primary]
}
