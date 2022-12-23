// eslint-disable-next-line @typescript-eslint/no-var-requires
(require("source-map-support") as { install : () => void }).install();

// Import test suites
import * as openzeppelin from "./openzeppelin";
import * as erc1155m from "./erc1155m";


// Run test suites
openzeppelin.runTests();
erc1155m.runTests();
