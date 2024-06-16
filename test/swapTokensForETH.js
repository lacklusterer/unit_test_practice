const { expect } = require("chai");
const hre = require("hardhat");
const ethers = require("ethers");

describe("TokenExchange", function () {
	let Token, token, TokenExchange, exchange, owner, addr1, addr2;
	let token_reserves, eth_reserves;
	let bigTokenReserves, bigETHReserves;

	const multiplier = ethers.BigNumber.from(10 ** 5);
	const swap_fee_numerator = ethers.BigNumber.from(3);
	const swap_fee_denominator = ethers.BigNumber.from(100);

	// beforeEach resets the network, deploys contracts, creates liquidity pool
	beforeEach(async function () {
		await hre.network.provider.request({
			method: "hardhat_reset",
			params: [],
		});

		[owner, addr1, addr2] = await hre.ethers.getSigners();

		// Deploy the Token contract
		Token = await hre.ethers.getContractFactory("Token");
		token = await Token.deploy();

		// Deploy the TokenExchange contract
		TokenExchange = await hre.ethers.getContractFactory("TokenExchange");
		exchange = await TokenExchange.deploy();

		// Mint tokens to the owner
		token_reserves = ethers.utils.parseUnits("5000", 18);
		await token.mint(token_reserves);

		// Approve the exchange contract to spend owner's tokens
		await token.approve(exchange.address, token_reserves);

		// Create the liquidity pool
		eth_reserves = ethers.utils.parseUnits("5000", "ether");
		await exchange.createPool(token_reserves, { value: eth_reserves });

		[bigETHReserves, bigTokenReserves] = [eth_reserves, token_reserves].map(
			ethers.BigNumber.from
		);
	});

	describe("Swap Tokens for ETH", function () {
		it("Should swap tokens for ETH with expected echange rate", async function () {
			const tokenAmount = ethers.utils.parseUnits("1", 18);

			const max_exchange_rate = ethers.BigNumber.from(
				ethers.utils.parseUnits("2", 23)
			);

			const balanceBeforeTrade = await hre.ethers.provider.getBalance(
				addr1.address
			);

			const tx = await exchange
				.connect(addr1)
				.swapTokensForETH(tokenAmount, max_exchange_rate);

			const receipt = await tx.wait();
			const gasUsed = receipt.gasUsed;
			const gasPrice = tx.gasPrice;
			const gasFee = gasUsed.mul(gasPrice);

			const expectedETH = swap_fee_denominator
				.sub(swap_fee_numerator)
				.mul(tokenAmount)
				.mul(bigETHReserves)
				.div(bigTokenReserves.add(tokenAmount).mul(swap_fee_denominator));

			const balanceAfterTrade = await hre.ethers.provider.getBalance(
				addr1.address
			);

			expect(balanceBeforeTrade.sub(gasFee).add(expectedETH)).to.equal(
				balanceAfterTrade
			);
		});

		it("Should not swap if slippage too large", async function () {
			const tokenAmount = ethers.utils.parseUnits("1", 18);

			await token.mint(tokenAmount);
			await token.approve(addr1.address, tokenAmount);
			await token.transfer(addr1.address, tokenAmount);
			await token.connect(addr1).approve(exchange.address, tokenAmount);

			const max_exchange_rate = ethers.BigNumber.from(
				ethers.utils.parseUnits("1", 23)
			);

			const tx = exchange
				.connect(addr1)
				.swapTokensForETH(tokenAmount, max_exchange_rate);

			await expect(tx).to.be.revertedWith("Slippage too large");
		});
	});

	describe("Special cases", () => {
		it("Should reject if max_slippage is negative", async function () {
			const tokenAmount = ethers.utils.parseUnits("1", 18);

			await token.mint(tokenAmount);
			await token.approve(addr1.address, tokenAmount);
			await token.transfer(addr1.address, tokenAmount);
			await token.connect(addr1).approve(exchange.address, tokenAmount);

			const max_exchange_rate = ethers.BigNumber.from(
				ethers.utils.parseUnits("-1", 23)
			);

			await expect(
				exchange.connect(addr1).swapTokensForETH(tokenAmount, max_exchange_rate)
			).to.be.rejectedWith(Error);
		});
	});
});