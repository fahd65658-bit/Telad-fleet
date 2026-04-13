
import sqlite3
import tkinter as tk
from tkinter import ttk

DB_PATH = "../database/telad.db"

def connect_db():
    return sqlite3.connect(DB_PATH)

class TeladApp:

    def __init__(self, root):
        self.root = root
        root.title("إدارة العمليات اللوجستية - شركة تلاد")
        root.geometry("900x600")

        title = tk.Label(root, text="TELAD Logistics Operations", font=("Arial", 18, "bold"))
        title.pack(pady=10)

        notebook = ttk.Notebook(root)
        notebook.pack(fill="both", expand=True)

        self.dashboard = ttk.Frame(notebook)
        self.vehicles = ttk.Frame(notebook)
        self.employees = ttk.Frame(notebook)

        notebook.add(self.dashboard, text="لوحة التحكم")
        notebook.add(self.vehicles, text="المركبات")
        notebook.add(self.employees, text="الموظفين")

        self.build_dashboard()
        self.build_vehicles()
        self.build_employees()

    def build_dashboard(self):
        label = tk.Label(self.dashboard, text="مركز العمليات", font=("Arial", 14))
        label.pack(pady=10)

        self.stats = tk.Label(self.dashboard, text="", font=("Arial", 12))
        self.stats.pack()

        self.refresh_stats()

    def refresh_stats(self):
        conn = connect_db()
        c = conn.cursor()
        vehicles = c.execute("SELECT COUNT(*) FROM vehicles").fetchone()[0]
        employees = c.execute("SELECT COUNT(*) FROM employees").fetchone()[0]
        conn.close()

        self.stats.config(text=f"عدد المركبات: {vehicles} | عدد الموظفين: {employees}")

    def build_vehicles(self):
        frame = tk.Frame(self.vehicles)
        frame.pack(pady=10)

        tk.Label(frame, text="رقم اللوحة").grid(row=0, column=0)
        tk.Label(frame, text="نوع المركبة").grid(row=0, column=1)
        tk.Label(frame, text="الموديل").grid(row=0, column=2)

        self.plate = tk.Entry(frame)
        self.type = tk.Entry(frame)
        self.model = tk.Entry(frame)

        self.plate.grid(row=1, column=0)
        self.type.grid(row=1, column=1)
        self.model.grid(row=1, column=2)

        add_btn = tk.Button(frame, text="إضافة مركبة", command=self.add_vehicle)
        add_btn.grid(row=1, column=3, padx=10)

        self.vehicle_list = tk.Listbox(self.vehicles, width=100)
        self.vehicle_list.pack(pady=20)

        self.load_vehicles()

    def add_vehicle(self):
        plate = self.plate.get()
        vtype = self.type.get()
        model = self.model.get()

        conn = connect_db()
        c = conn.cursor()
        c.execute("INSERT INTO vehicles (plate_number, vehicle_type, model) VALUES (?,?,?)",(plate,vtype,model))
        conn.commit()
        conn.close()

        self.load_vehicles()
        self.refresh_stats()

    def load_vehicles(self):
        self.vehicle_list.delete(0, tk.END)
        conn = connect_db()
        c = conn.cursor()
        for row in c.execute("SELECT plate_number, vehicle_type, model FROM vehicles"):
            self.vehicle_list.insert(tk.END, row)
        conn.close()

    def build_employees(self):
        frame = tk.Frame(self.employees)
        frame.pack(pady=10)

        tk.Label(frame, text="اسم الموظف").grid(row=0, column=0)
        tk.Label(frame, text="الوظيفة").grid(row=0, column=1)

        self.emp_name = tk.Entry(frame)
        self.emp_role = tk.Entry(frame)

        self.emp_name.grid(row=1, column=0)
        self.emp_role.grid(row=1, column=1)

        add_btn = tk.Button(frame, text="إضافة موظف", command=self.add_employee)
        add_btn.grid(row=1, column=2, padx=10)

        self.emp_list = tk.Listbox(self.employees, width=100)
        self.emp_list.pack(pady=20)

        self.load_employees()

    def add_employee(self):
        name = self.emp_name.get()
        role = self.emp_role.get()

        conn = connect_db()
        c = conn.cursor()
        c.execute("INSERT INTO employees (name, role) VALUES (?,?)",(name,role))
        conn.commit()
        conn.close()

        self.load_employees()
        self.refresh_stats()

    def load_employees(self):
        self.emp_list.delete(0, tk.END)
        conn = connect_db()
        c = conn.cursor()
        for row in c.execute("SELECT name, role FROM employees"):
            self.emp_list.insert(tk.END, row)
        conn.close()

if __name__ == "__main__":
    root = tk.Tk()
    app = TeladApp(root)
    root.mainloop()
