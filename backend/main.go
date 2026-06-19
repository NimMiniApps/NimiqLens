package main

import (
	"log"
	"net/http"
	"os"
	"time"
)

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func main() {
	port := getEnv("PORT", "8787")
	coinGeckoBaseURL := getEnv("COINGECKO_API_BASE", "https://api.coingecko.com/api/v3")
	nimiqRPCURL := getEnv("NIMIQ_RPC_URL", "https://rpc-mainnet.nimiqscan.com")
	allowedOrigin := getEnv("ALLOWED_ORIGIN", "*")

	httpClient := &http.Client{Timeout: 10 * time.Second}

	ratesCache := NewRatesCache(60*time.Second, func() (RatesResponse, error) {
		return FetchRates(httpClient, coinGeckoBaseURL)
	})

	rpcClient := NewNimiqRPCClient(httpClient, nimiqRPCURL)

	mux := http.NewServeMux()
	mux.HandleFunc("GET /", rootHandler)
	mux.HandleFunc("GET /api/health", healthHandler)
	mux.HandleFunc("GET /api/version", versionHandler)
	mux.HandleFunc("GET /api/rates", ratesHandler(ratesCache))
	mux.HandleFunc("GET /api/balance/{address}", balanceHandler(rpcClient))

	log.Printf("NimLens backend listening on :%s commit=%s build_time=%s", port, CommitHash, BuildTime)
	if err := http.ListenAndServe(":"+port, withRequestLogging(withCORS(allowedOrigin, mux))); err != nil {
		log.Fatal(err)
	}
}
