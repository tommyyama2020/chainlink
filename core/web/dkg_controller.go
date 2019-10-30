package web

import (
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/pkg/errors"

	"github.com/smartcontractkit/chainlink/core/services"
	"github.com/smartcontractkit/chainlink/core/services/signatures/dkg"
	dkgpkg "github.com/smartcontractkit/chainlink/core/services/signatures/dkg"
	"github.com/smartcontractkit/chainlink/core/store/models"
	"github.com/smartcontractkit/chainlink/core/store/presenters"
)

type DKGController struct {
	App services.Application
}

type DKGRequest struct {
	Threshold uint
	Peers     []string
}

type parseJSON func(interface{}) error

// parseGenerateKeyRequest extracts the request using jsonParser, and does some
// basic sanity checks on it
func parseGenerateKeyRequest(jsonParser parseJSON) (
	threshold uint, peers []models.CompressedPubKey, err error) {
	var request DKGRequest
	if err := jsonParser(&request); err != nil {
		err = errors.Wrapf(err, "while parsing GenerateKey params")
		return 0, nil, err
	}
	if request.Threshold > uint(len(peers)) {
		return 0, nil, fmt.Errorf("threshold %d is greater than the number of peers %d",
			request.Threshold, len(peers))
	}
	if request.Threshold == 0 {
		return 0, nil, fmt.Errorf("threshold cannot be 0")
	}
	peers = make([]models.CompressedPubKey, len(request.Peers))
	for peerIdx, peerPubKey := range request.Peers {
		if err := peers[peerIdx].FromHex(peerPubKey); err != nil {
			return 0, nil, err
		}
	}
	return request.Threshold, peers, nil
}

// peerListIndex sanity-checks the peer list, and finds k's index in it
func peerListIndex(peers []models.CompressedPubKey, k *models.PrivateKey) (uint, error) {
	var peerCounts map[models.CompressedPubKey]int
	for _, cPubKey := range peers {
		peerCounts[cPubKey] += 1
	}
	for cPubKey, count := range peerCounts {
		if count > 1 {
			return 0, fmt.Errorf(
				"Key %s is listed as a signature participant multiple times", cPubKey)
		}
	}
	compressed := k.CompressedPublicKey()
	for keyIdx, cPubKey := range peers {
		if cPubKey == compressed {
			return uint(keyIdx), nil
		}
	}
	return 0, fmt.Errorf(
		"oracle key %s is not present in the signature participant list, %s",
		compressed, peers)
}

var failureParams dkgpkg.DKGParams // Empty params, for use on failure

// getGenerateKeyParams constructs the values needed for a DKG from the current
// request.
func getGenerateKeyParams(dkg *DKGController, c *gin.Context) (dkg.DKGParams, error) {
	threshold, peers, err := parseGenerateKeyRequest(c.ShouldBindJSON)
	if err != nil {
		jsonAPIError(c, http.StatusUnprocessableEntity, err)
		return failureParams, nil
	}
	ks := dkg.App.GetStore().KeyStore
	account, err := ks.GetFirstAccount()
	if err != nil {
		err = errors.Wrapf(err, "while looking for oracle account")
		return failureParams, err
	}
	key := ks.PrivKeysByAddress[account.Address]
	peerIdx, err := peerListIndex(peers, key)
	if err != nil {
		return failureParams, err
	}
	return dkgpkg.DKGParams{
		Threshold: threshold,
		Peers:     peers,
		KeyIdx:    peerIdx,
		SecretKey: key,
	}, nil
}

func (dkg *DKGController) GenerateKey(c *gin.Context) {
	if !dkg.App.GetStore().Config.Dev() {
		jsonAPIError(c, http.StatusMethodNotAllowed,
			fmt.Errorf("Threshold cryptography is currently under development, and "+
				"not yet usable outside of development mode."))
		return
	}
	params, err := getGenerateKeyParams(dkg, c)
	if err != nil {
		jsonAPIError(c, http.StatusMethodNotAllowed, err)
		return
	}
	sharedKey, err := dkgpkg.GenerateSharedKey(params)
	if err != nil {
		jsonAPIError(c, http.StatusInternalServerError,
			errors.Wrapf(err, "while attempting to generate shared key"))
		return
	}
	sharedKeyPresentation, err := presenters.NewSharedKey(sharedKey)
	if err != nil {
		jsonAPIError(c, http.StatusInternalServerError,
			errors.Wrapf(err, "problem with key generated by dkg"))
	}
	jsonAPIResponse(c, sharedKeyPresentation, "shared key")
}
