// Test_AccessControl

import { keccak256, toUtf8Bytes } from "ethers/lib/utils";
import { AccessControlMockArtifact, AccessControlMockContract } from "~/abi/AccessControlMock";
import { redeployContract } from "~/artifacts";
import { DESCRIBE, expectEvent, expectNoEvent, expectReversion, IT } from "~/utils";
import { shouldSupportInterfaces } from "../supportsInterface";

const DEFAULT_ADMIN_ROLE = "0x0000000000000000000000000000000000000000000000000000000000000000" as Bytes32;
const ROLE = keccak256(toUtf8Bytes("ROLE")) as Bytes32;
const OTHER_ROLE = keccak256(toUtf8Bytes("OTHER_ROLE")) as Bytes32;

export function test_AccessControl(accounts : Address[]) {
    const [admin, authorized, other, otherAdmin] = accounts;

    let instance : AccessControlMockContract;
    const getInstance = async (redeploy = false) => {
        if (redeploy || instance as unknown === undefined) {
            instance = await redeployContract<AccessControlMockArtifact>(
                "AccessControlMock",
                {
                    redeploy : true,
                    args : [],
                },
            );
        }

        return instance;
    };

    beforeEach(async () => {
        instance = await getInstance(true);
    });

    DESCRIBE("default admin", () => {
        IT("deployer has default admin role", async () => {
            assert.strictEqual(await instance.hasRole(DEFAULT_ADMIN_ROLE, admin), true);
        });

        IT("other roles's admin is the default admin role", async () => {
            assert.strictEqual(await instance.getRoleAdmin(ROLE), DEFAULT_ADMIN_ROLE);
        });

        IT("default admin role's admin is ITself", async () => {
            assert.strictEqual(await instance.getRoleAdmin(DEFAULT_ADMIN_ROLE), DEFAULT_ADMIN_ROLE);
        });
    });

    DESCRIBE("granting", () => {
        beforeEach(async () => {
            await instance.grantRole(ROLE, authorized, { from : admin });
        });

        IT("non-admin cannot grant role to other accounts", async () => {
            await expectReversion(
                instance,
                undefined,
                other,
                "grantRole",
                ROLE,
                authorized,
            );
        });

        IT("accounts can be granted a role multiple times", async () => {
            await instance.grantRole(ROLE, authorized, { from : admin });
            const receipt = await instance.grantRole(ROLE, authorized, { from : admin });
            expectNoEvent(receipt, "RoleGranted");
        });
    });

    DESCRIBE("revoking", () => {
        IT("roles that are not had can be revoked", async () => {
            assert.strictEqual(await instance.hasRole(ROLE, authorized), false);

            const receipt = await instance.revokeRole(ROLE, authorized, { from : admin });
            expectNoEvent(receipt, "RoleRevoked");
        });

        context("with granted role", () => {
            beforeEach(async () => {
                await instance.grantRole(ROLE, authorized, { from : admin });
            });

            IT("admin can revoke role", async () => {
                const receipt = await instance.revokeRole(ROLE, authorized, { from : admin });
                expectEvent(receipt, "RoleRevoked", {
                    account : authorized,
                    role : ROLE,
                    sender : admin,
                });

                assert.strictEqual(await instance.hasRole(ROLE, authorized), false);
            });

            IT("non-admin cannot revoke role", async () => {
                await expectReversion(
                    instance,
                    undefined,
                    other,
                    "revokeRole",
                    ROLE,
                    authorized,
                );
            });

            IT("a role can be revoked multiple times", async () => {
                await instance.revokeRole(ROLE, authorized, { from : admin });

                const receipt = await instance.revokeRole(ROLE, authorized, { from : admin });
                expectNoEvent(receipt, "RoleRevoked");
            });
        });
    });

    DESCRIBE("renouncing", () => {
        IT("roles that are not had can be renounced", async () => {
            const receipt = await instance.renounceRole(ROLE, authorized, { from : authorized });
            expectNoEvent(receipt, "RoleRevoked");
        });

        context("with granted role", () => {
            beforeEach(async () => {
                await instance.grantRole(ROLE, authorized, { from : admin });
            });

            IT("bearer can renounce role", async () => {
                const receipt = await instance.renounceRole(ROLE, authorized, { from : authorized });
                expectEvent(receipt, "RoleRevoked", {
                    account : authorized,
                    role : ROLE,
                    sender : authorized,
                });

                assert.strictEqual(await instance.hasRole(ROLE, authorized), false);
            });

            IT("only the sender can renounce their roles", async () => {
                await expectReversion(
                    instance,
                    undefined,
                    admin,
                    "renounceRole",
                    ROLE,
                    authorized,
                );
            });

            IT("a role can be renounced multiple times", async () => {
                await instance.renounceRole(ROLE, authorized, { from : authorized });

                const receipt = await instance.renounceRole(ROLE, authorized, { from : authorized });
                expectNoEvent(receipt, "RoleRevoked");
            });
        });
    });

    DESCRIBE("setting role admin", () => {
        beforeEach(async () => {
            const receipt = await instance.setRoleAdmin(ROLE, OTHER_ROLE);
            expectEvent(receipt, "RoleAdminChanged", {
                role : ROLE,
                previousAdminRole : DEFAULT_ADMIN_ROLE,
                newAdminRole : OTHER_ROLE,
            });

            await instance.grantRole(OTHER_ROLE, otherAdmin, { from : admin });
        });

        IT("a role's admin role can be changed", async () => {
            assert.strictEqual(await instance.getRoleAdmin(ROLE), OTHER_ROLE);
        });

        IT("the new admin can grant roles", async () => {
            const receipt = await instance.grantRole(ROLE, authorized, { from : otherAdmin });
            expectEvent(receipt, "RoleGranted", {
                account : authorized,
                role : ROLE,
                sender : otherAdmin,
            });
        });

        IT("the new admin can revoke roles", async () => {
            await instance.grantRole(ROLE, authorized, { from : otherAdmin });
            const receipt = await instance.revokeRole(ROLE, authorized, { from : otherAdmin });
            expectEvent(receipt, "RoleRevoked", {
                account : authorized,
                role : ROLE,
                sender : otherAdmin,
            });
        });

        IT("a role's previous admins no longer grant roles", async () => {
            await expectReversion(
                instance,
                undefined,
                admin,
                "grantRole",
                ROLE,
                authorized,
            );
        });

        IT("a role's previous admins no longer revoke roles", async () => {
            await expectReversion(
                instance,
                undefined,
                admin,
                "revokeRole",
                ROLE,
                authorized,
            );
        });
    });

    DESCRIBE("onlyRole modifier", () => {
        beforeEach(async () => {
            await instance.grantRole(ROLE, authorized, { from : admin });
        });

        IT("do not revert if sender has role", async () => {
            await instance.senderProtected(ROLE, { from : authorized });
        });

        IT("revert if sender doesn't have role #1", async () => {
            await expectReversion(
                instance,
                undefined,
                other,
                "senderProtected",
                ROLE,
            );
        });

        IT("revert if sender doesn't have role #2", async () => {
            await expectReversion(
                instance,
                undefined,
                authorized,
                "senderProtected",
                OTHER_ROLE,
            );
        });
    });

    DESCRIBE("should support interfaces", async () => {
        shouldSupportInterfaces(await getInstance(), ["AccessControl"]);
    });
}
