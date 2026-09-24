import { Navigate, Route, Routes } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute";
import AdminLayout from "./components/AdminLayout";
import Login from "./pages/Login";
import StudentExamFlow from "./pages/student/StudentExamFlow";
import Dashboard from "./pages/admin/Dashboard";
import ExamList from "./pages/admin/ExamList";
import ExamForm from "./pages/admin/ExamForm";
import ExamDetail from "./pages/admin/ExamDetail";
import Students from "./pages/admin/Students";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<StudentExamFlow />} />
      <Route path="/exam/*" element={<StudentExamFlow />} />
      <Route path="/student/*" element={<StudentExamFlow />} />
      <Route path="/login" element={<Login />} />
      <Route path="/admin" element={<ProtectedRoute role="ADMIN"><AdminLayout /></ProtectedRoute>}>
        <Route index element={<Dashboard />} />
        <Route path="exams" element={<ExamList />} />
        <Route path="exams/new" element={<ExamForm />} />
        <Route path="exams/:id" element={<ExamDetail />} />
        <Route path="exams/:id/edit" element={<ExamForm />} />
        <Route path="students" element={<Students />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

