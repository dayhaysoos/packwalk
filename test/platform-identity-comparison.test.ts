import { expect, it } from "vitest"

import { projectIdentityComparisonKey } from "../src/adapters/project-identity.js"
import { sameSessionIdentity } from "../src/domain/session.js"

it("keeps exact session identity separate from injected platform path semantics", () => {
  expect(sameSessionIdentity("SESSION-A", "session-a")).toBe(false)
  expect(sameSessionIdentity("SESSION-A", "SESSION-A")).toBe(true)

  expect(projectIdentityComparisonKey("C:/Work/Repo", "win32")).toBe(
    projectIdentityComparisonKey("c:\\work\\repo", "win32"),
  )
  expect(projectIdentityComparisonKey("/Work/Repo", "darwin")).not.toBe(
    projectIdentityComparisonKey("/work/repo", "darwin"),
  )
  expect(projectIdentityComparisonKey("/Work/Repo", "linux")).not.toBe(
    projectIdentityComparisonKey("/work/repo", "linux"),
  )
  expect(projectIdentityComparisonKey("/work/a\\b", "darwin")).not.toBe(
    projectIdentityComparisonKey("/work/a/b", "darwin"),
  )
  expect(projectIdentityComparisonKey("/work/a\\b", "linux")).not.toBe(
    projectIdentityComparisonKey("/work/a/b", "linux"),
  )
})
