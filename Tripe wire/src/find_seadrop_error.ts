import { toFunctionSelector } from 'viem';

const allSeaDropErrors = [
  'InvalidFeeBps(uint256 feeBps, uint256 maxFeeBps)',
  'InvalidFeeBps(uint256 feeBps)',
  'InvalidFeeBps()',
  'FeeRecipientNotAllowed()',
  'FeeRecipientNotAllowed(address feeRecipient)',
  'FeeRecipientNotAllowed(address feeRecipient, address nftContract)',
  'FeeRecipientNotPresent()',
  'CannotGivePayerFeeRecipientIfRestricted()',
  'FeeRecipientCannotBeZeroAddress()',
  'InvalidFeeRecipient()',
  'InvalidFeeRecipient(address feeRecipient)',
  'MintQuantityExceedsMaxMintablePerWallet(uint256 total, uint256 maxAllowed)',
  'MintQuantityExceedsMaxMintablePerWallet(uint256 total)',
  'MintQuantityExceedsMaxMintablePerWallet()',
  'MintQuantityExceedsMaxTotalMintableByWallet(uint256 total, uint256 maxAllowed)',
  'MintQuantityExceedsMaxTotalMintableByWallet(uint256 total)',
  'MintQuantityExceedsMaxTotalMintableByWallet()',
  'MaxTotalMintableByWalletExceeded()',
  'MaxTotalMintableByWalletExceeded(uint256 total, uint256 maxAllowed)',
  'AlreadyMinted()',
  'NotActive()',
  'NotActive(uint256 startTime, uint256 endTime)',
  'NotActive(uint256 time)',
  'SoldOut()',
  'SoldOut(uint256 totalSupply, uint256 maxSupply)',
  'ExceedsMaxSupply()',
  'ExceedsMaxSupply(uint256 quantity, uint256 remainingSupply)',
  'IncorrectPayment(uint256 got, uint256 expected)',
  'IncorrectPayment()',
  'FeeRecipientNotAllowed(address nftContract, address feeRecipient)',
  'InvalidFeeRecipient(address nftContract, address feeRecipient)',
  'PayerCannotBeFeeRecipient()',
  'PayerCannotBeFeeRecipient(address payer)',
  'PayerIsFeeRecipient()',
  'FeeRecipientIsPayer()',
];

const target = '0x5136e8d5';
console.log(`Searching for selector matching ${target}...`);

for (const err of allSeaDropErrors) {
  try {
    const selector = toFunctionSelector(`error ${err}`);
    if (selector === target) {
      console.log(`🎉 MATCH FOUND! ${selector} -> error ${err}`);
    }
  } catch {}
}
