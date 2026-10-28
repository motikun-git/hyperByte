import { createContext, useContext } from "react";

/** { admin: { id, name, email }, logout() } for the signed-in admin. */
export const AdminContext = createContext(null);
export const useAdmin = () => useContext(AdminContext);
