import { createContext } from "react";

// Kept in a tiny module so the provider and the hook can live in separate files
// (which also keeps React Fast Refresh happy during development).
export const AuthContext = createContext(null);
