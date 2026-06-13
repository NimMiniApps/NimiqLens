package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
)

const lunaPerNIM = 100000.0

// BalanceResponse is the payload returned by GET /api/balance/:address.
type BalanceResponse struct {
	Address    string  `json:"address"`
	BalanceNIM float64 `json:"balance_nim"`
}

// NimiqRPCClient queries a Nimiq Albatross JSON-RPC node for account data.
type NimiqRPCClient struct {
	client *http.Client
	rpcURL string
}

// NewNimiqRPCClient creates a client targeting the given RPC URL.
func NewNimiqRPCClient(client *http.Client, rpcURL string) *NimiqRPCClient {
	return &NimiqRPCClient{client: client, rpcURL: rpcURL}
}

type rpcRequest struct {
	JSONRPC string `json:"jsonrpc"`
	Method  string `json:"method"`
	Params  []any  `json:"params"`
	ID      int    `json:"id"`
}

type rpcAccountData struct {
	Address string `json:"address"`
	Balance int64  `json:"balance"`
}

type rpcResult struct {
	Data rpcAccountData `json:"data"`
}

type rpcErrorBody struct {
	Message string `json:"message"`
}

type rpcResponse struct {
	Result *rpcResult    `json:"result"`
	Error  *rpcErrorBody `json:"error"`
}

// GetBalance returns the NIM balance for address by calling getAccountByAddress.
func (c *NimiqRPCClient) GetBalance(address string) (BalanceResponse, error) {
	reqBody, err := json.Marshal(rpcRequest{
		JSONRPC: "2.0",
		Method:  "getAccountByAddress",
		Params:  []any{address},
		ID:      1,
	})
	if err != nil {
		return BalanceResponse{}, fmt.Errorf("encoding rpc request: %w", err)
	}

	resp, err := c.client.Post(c.rpcURL, "application/json", bytes.NewReader(reqBody))
	if err != nil {
		return BalanceResponse{}, fmt.Errorf("calling nimiq rpc: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return BalanceResponse{}, fmt.Errorf("nimiq rpc returned status %d", resp.StatusCode)
	}

	var rpcResp rpcResponse
	if err := json.NewDecoder(resp.Body).Decode(&rpcResp); err != nil {
		return BalanceResponse{}, fmt.Errorf("decoding rpc response: %w", err)
	}

	if rpcResp.Error != nil {
		return BalanceResponse{}, fmt.Errorf("nimiq rpc error: %s", rpcResp.Error.Message)
	}
	if rpcResp.Result == nil {
		return BalanceResponse{}, fmt.Errorf("nimiq rpc returned no result")
	}

	return BalanceResponse{
		Address:    address,
		BalanceNIM: float64(rpcResp.Result.Data.Balance) / lunaPerNIM,
	}, nil
}
