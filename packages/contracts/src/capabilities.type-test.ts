import type {
  CloudRuntimeAdapter,
  CloudUploadCapability,
  LocalImportCapability,
  LocalRuntimeAdapter,
} from "./adapter";

type Assert<T extends true> = T;
type HasKey<T, TKey extends PropertyKey> = TKey extends keyof T ? true : false;

type CloudHasNoFolderImport = Assert<
  HasKey<CloudRuntimeAdapter, keyof LocalImportCapability> extends false ? true : false
>;
type LocalHasNoCloudUpload = Assert<
  HasKey<LocalRuntimeAdapter, keyof CloudUploadCapability> extends false ? true : false
>;

export type CapabilityIsolationProof =
  | CloudHasNoFolderImport
  | LocalHasNoCloudUpload;
