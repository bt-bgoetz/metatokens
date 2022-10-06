require("@nomiclabs/hardhat-truffle5");
require("hardhat-gas-reporter");
require("@openzeppelin/hardhat-upgrades");

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
    solidity : {
        compilers : [
            {
                version : "0.8.13",
                settings : {
                    optimizer : {
                        enabled : true,
                        runs : 200
                    },
                },
            },
        ],
    },

    networks : {
        development : {
            url : "127.0.0.1",     // Localhost (default: none)
            port : 7545,            // Standard Ethereum port (default: none)
            network_id : "*",       // Any network (default: none)
            gas : 11721970,
            // gasPrice: 0
        },
        rinkeby : {
            url : "https://rinkeby.infura.io/v3/<INFURA PROJECT KEY>",     // Localhost (default: none)
            port : 7545,            // Standard Ethereum port (default: none)
            network_id : "4",       // Rinkeby
            gas : 11721970,
            accounts : [
                // Private Key
            ]
            // gasPrice: 0
        },
    },

    gasReporter : {
        enabled : true,
        excludeContracts : ["@openzeppelin"],
        showMethodSig : true,
    }
};
