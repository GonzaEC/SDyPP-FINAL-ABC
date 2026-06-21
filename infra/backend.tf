terraform {
  backend "gcs" {
    bucket = "tp-final-sdypp-tfstate"
    prefix = "terraform/state"
  }
}
